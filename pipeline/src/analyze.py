import base64
import json
import re
from pathlib import Path
from typing import Dict, List, Optional

import anthropic

from pipeline.src.cost import CostTracker


def build_analysis_prompt(
    transcript_chunk: str,
    source_type: str,
    start_time: float,
    end_time: float,
    source_metadata: Optional[Dict[str, str]] = None,
) -> str:
    """Build the analysis prompt based on source type and metadata.

    Args:
        transcript_chunk: The transcript text for this segment.
        source_type: One of "coaching", "youtube", or other.
        start_time: Segment start time in seconds.
        end_time: Segment end time in seconds.
        source_metadata: Optional dict with keys like "title", "channel".

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

    prompt = (
        f"{context}\n\n"
        f"Segment time: {start_time:.1f}s - {end_time:.1f}s\n\n"
        f"Transcript:\n{transcript_chunk}\n\n"
        "Analyze this segment and return a JSON object with these fields:\n"
        "- topic: the main topic discussed\n"
        "- categories: list of golf categories (e.g. swing mechanics, putting, mental game)\n"
        "- coach_tips: list of specific tips or instructions given\n"
        "- student_observations: list of observations about the student's performance\n"
        "- visual_context: description of what's visible in the frames\n"
        "- summary: a concise summary of the segment\n\n"
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


def analyze_batch(
    transcript_chunk: str,
    frame_paths: List[str],
    source_type: str,
    start_time: float,
    end_time: float,
    cost_tracker: CostTracker,
    source_metadata: Optional[Dict[str, str]] = None,
    model: str = "claude-sonnet-4.6",
) -> Dict:
    """Analyze a video segment using Claude with multimodal input.

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
    client = anthropic.Anthropic()

    prompt = build_analysis_prompt(
        transcript_chunk=transcript_chunk,
        source_type=source_type,
        start_time=start_time,
        end_time=end_time,
        source_metadata=source_metadata,
    )

    # Build multimodal content: images first, then text prompt
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

    # Track costs
    tokens_used = response.usage.input_tokens + response.usage.output_tokens
    cost_tracker.add(
        tokens=tokens_used,
        stage="analysis",
        details=f"segment {start_time:.1f}-{end_time:.1f}s",
    )

    return parse_analysis_response(response.content[0].text)
