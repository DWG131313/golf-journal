import base64
import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Dict, List, Optional

import anthropic

from pipeline.src.cost import CostTracker


def _load_env_local() -> None:
    """Load .env.local from project root (Next.js convention).

    Lightweight parser — no python-dotenv dependency. Only sets vars that
    aren't already in the environment, so shell exports still win.
    """
    project_root = Path(__file__).resolve().parents[2]
    env_file = project_root / ".env.local"
    if not env_file.is_file():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().removeprefix("export ").strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_local()

# Backend selection: env var `GOLF_COACH_BACKEND` wins, otherwise default to
# "api" when ANTHROPIC_API_KEY is set and "cli" otherwise.
BACKEND = os.environ.get(
    "GOLF_COACH_BACKEND",
    "api" if os.environ.get("ANTHROPIC_API_KEY") else "cli",
)


def build_analysis_prompt(
    transcript_chunk: str,
    source_type: str,
    start_time: float,
    end_time: float,
    source_metadata: Optional[Dict[str, str]] = None,
    frame_paths: Optional[List[str]] = None,
) -> str:
    """Build the analysis prompt based on source type and metadata.

    Args:
        transcript_chunk: The transcript text for this segment.
        source_type: One of "coaching", "youtube", or other.
        start_time: Segment start time in seconds.
        end_time: Segment end time in seconds.
        source_metadata: Optional dict with keys like "title", "channel".
        frame_paths: Optional list of keyframe file paths for context.

    Returns:
        A prompt string for Claude to analyze the segment.
    """
    if source_type == "coaching":
        context = (
            "This is a segment from a personal golf coaching session between "
            "a coach and Danny. Analyze the interaction between coach and student."
        )
    elif source_type == "youtube":
        title = (source_metadata or {}).get("title", "Unknown")
        channel = (source_metadata or {}).get("channel", "Unknown")
        context = (
            f"This is a segment from a YouTube golf instruction video. "
            f"Video title: {title}. Channel: {channel}. "
            f"Analyze the instructional content presented."
        )
    else:
        context = (
            "This is a segment from a golf instruction video. "
            "Analyze the golf instruction content."
        )

    frames_note = ""
    if frame_paths:
        frames_note = (
            f"\n\nKeyframes from this segment ({len(frame_paths)} frames): "
            + ", ".join(Path(p).name for p in frame_paths)
        )

    prompt = (
        f"{context}\n\n"
        f"Segment time: {start_time:.1f}s - {end_time:.1f}s\n\n"
        f"Transcript:\n{transcript_chunk}\n\n"
        f"{frames_note}"
        "Your job is to extract ONLY actionable coaching knowledge from this segment.\n\n"
        "First, assess whether this segment contains real coaching instruction. "
        "Segments that are just casual conversation, facility tours, repeated encouragement "
        '("it\'s good, it\'s good"), equipment chat, or transcription artifacts should be '
        'marked as coaching_value: "none".\n\n'
        "Return a JSON object with these fields:\n"
        '- coaching_value: "high", "medium", or "none"\n'
        "  - high: contains specific, actionable technique instruction (drill details, "
        "swing measurements, setup corrections with numbers/specifics)\n"
        "  - medium: contains general coaching direction but nothing highly specific\n"
        "  - none: casual chat, facility tour, repetitive encouragement, transcription noise\n"
        "- topic: concise topic (2-6 words). Only if coaching_value is not none.\n"
        "- categories: list of golf categories. Only if coaching_value is not none.\n"
        "- coach_tips: list of SPECIFIC, ACTIONABLE tips only. Each tip should be something "
        "Danny can actually do or check. Exclude generic encouragement, obvious statements, "
        "and anything not directly about golf technique. If the coach gives a specific number "
        "(angle, distance, position), include it.\n"
        "- student_observations: list of SPECIFIC technical observations about Danny's swing "
        "or setup. Exclude generic observations like 'student appears to understand'.\n"
        "- visual_context: brief description of what's being analyzed (e.g. 'face-on swing "
        "video at impact position'). Skip if not relevant.\n"
        "- summary: 1-2 sentence summary focused on the key coaching takeaway. What should "
        "Danny remember from this segment?\n\n"
        "For coaching_value: none, return minimal fields:\n"
        '{"coaching_value": "none", "topic": "", "categories": [], "coach_tips": [], '
        '"student_observations": [], "visual_context": "", "summary": ""}\n\n'
        "Return ONLY the JSON object, no other text."
    )
    return prompt


def parse_analysis_response(raw_text: str) -> Dict:
    """Parse Claude's response, stripping markdown code fences if present.

    Args:
        raw_text: Raw text response from Claude, possibly wrapped in ```json fences.

    Returns:
        Parsed JSON as a dict.
    """
    text = raw_text.strip()
    # Strip markdown code fences: ```json ... ``` or ``` ... ```
    match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?\s*```$", text, re.DOTALL)
    if match:
        text = match.group(1).strip()
    return json.loads(text)


def _analyze_via_api(
    prompt: str,
    frame_paths: List[str],
    cost_tracker: CostTracker,
    start_time: float,
    end_time: float,
    model: str,
) -> Dict:
    """Call Claude via the Anthropic API (requires ANTHROPIC_API_KEY)."""
    client = anthropic.Anthropic()

    content = []
    for frame_path in frame_paths:
        image_data = Path(frame_path).read_bytes()
        encoded = base64.b64encode(image_data).decode("utf-8")
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": encoded,
            },
        })
    content.append({"type": "text", "text": prompt})

    response = client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": content}],
    )

    tokens_used = response.usage.input_tokens + response.usage.output_tokens
    cost_tracker.add(
        tokens=tokens_used,
        stage="analysis",
        details=f"segment {start_time:.1f}-{end_time:.1f}s",
    )

    return parse_analysis_response(response.content[0].text)


def _analyze_via_cli(
    prompt: str,
    cost_tracker: CostTracker,
    start_time: float,
    end_time: float,
    model: str,
) -> Dict:
    """Call Claude via the Claude Code CLI (uses Max plan auth)."""
    # CLI uses hyphens (claude-sonnet-4-6), API uses dots (claude-sonnet-4.6)
    cli_model = model.replace(".", "-") if "." in model else model
    result = subprocess.run(
        [
            "claude", "-p",
            "--model", cli_model,
            "--output-format", "text",
            "--no-session-persistence",
        ],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"claude CLI failed (exit {result.returncode}):\n"
            f"  stderr: {result.stderr[:500]}\n"
            f"  stdout: {result.stdout[:500]}"
        )

    raw_text = result.stdout.strip()
    if not raw_text:
        raise RuntimeError(
            f"claude CLI returned empty response for segment "
            f"{start_time:.1f}-{end_time:.1f}s\n"
            f"  stderr: {result.stderr[:500]}"
        )

    cost_tracker.add(
        tokens=0,  # CLI doesn't report token counts; covered by Max plan
        stage="analysis",
        details=f"segment {start_time:.1f}-{end_time:.1f}s (cli)",
    )

    return parse_analysis_response(raw_text)


def _analyze_via_cli_with_retry(
    prompt: str,
    cost_tracker: CostTracker,
    start_time: float,
    end_time: float,
    model: str,
    max_retries: int = 2,
) -> Dict:
    """Call _analyze_via_cli with retries on transient failures."""
    for attempt in range(max_retries + 1):
        try:
            return _analyze_via_cli(prompt, cost_tracker, start_time, end_time, model)
        except (RuntimeError, json.JSONDecodeError) as exc:
            if attempt < max_retries:
                wait = 5 * (attempt + 1)
                print(f"    Retry {attempt + 1}/{max_retries} after {wait}s: {exc}")
                time.sleep(wait)
            else:
                raise


def analyze_batch(
    transcript_chunk: str,
    frame_paths: List[str],
    source_type: str,
    start_time: float,
    end_time: float,
    cost_tracker: CostTracker,
    source_metadata: Optional[Dict[str, str]] = None,
    model: str = "claude-sonnet-4-6",
) -> Dict:
    """Analyze a video segment using Claude.

    Uses the Claude Code CLI by default (BACKEND="cli"), falling back to
    the Anthropic API if BACKEND="api".

    Args:
        transcript_chunk: The transcript text for this segment.
        frame_paths: List of paths to PNG frame images.
        source_type: One of "coaching", "youtube", or other.
        start_time: Segment start time in seconds.
        end_time: Segment end time in seconds.
        cost_tracker: CostTracker instance for budget tracking.
        source_metadata: Optional dict with keys like "title", "channel".
        model: Claude model to use.

    Returns:
        Parsed analysis dict with topic, categories, tips, etc.
    """
    prompt = build_analysis_prompt(
        transcript_chunk=transcript_chunk,
        source_type=source_type,
        start_time=start_time,
        end_time=end_time,
        source_metadata=source_metadata,
        frame_paths=frame_paths,
    )

    backend = os.environ.get(
        "GOLF_COACH_BACKEND",
        "api" if os.environ.get("ANTHROPIC_API_KEY") else "cli",
    )
    if backend == "cli":
        return _analyze_via_cli_with_retry(
            prompt=prompt,
            cost_tracker=cost_tracker,
            start_time=start_time,
            end_time=end_time,
            model=model,
        )
    else:
        return _analyze_via_api(
            prompt=prompt,
            frame_paths=frame_paths,
            cost_tracker=cost_tracker,
            start_time=start_time,
            end_time=end_time,
            model=model,
        )
