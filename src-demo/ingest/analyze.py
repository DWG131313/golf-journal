"""Topical segmentation + topic/drill extraction via Claude.

Reads videos at status='transcribed', asks Claude (Sonnet 4.6) to:
  - break the lesson into topical segments
  - identify named topics + drills with exact timestamps and quotes
  - label speaker turns ('coach' vs 'student') from content + register

Writes:
  - transcripts.speakers_json   (speaker_turns array)
  - segments                    (incl. dominant_speaker)
  - topic_mentions / drill_mentions (incl. speaker label)

Updates videos.status -> 'analyzed' on success.

Uses prompt caching on the system prompt so batch runs across many
lessons amortize the system-prompt cost across calls.

Future fallback: speaker identification here is LLM-heuristic from
content. If accuracy on multi-speaker dialogue isn't good enough,
swap in real audio diarization via pyannote.audio (~500MB dep,
needs HuggingFace token for pyannote/speaker-diarization-3.1).
The speakers_json column is the integration point.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "db"))

PROJECT_ROOT = HERE.parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

import anthropic

from database import Database
from models import Segment, TopicMention, DrillMention, ProcessingLog

DEFAULT_MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are a golf coaching analyst. You receive a transcript of a coaching lesson with timestamps. Your job:

1. Identify SPEAKER TURNS. Label each time range as "coach" or "student":
   - coach: giving instructions, demonstrating, making observations, comparing to pros, diagnosing faults
   - student: asking questions, short acknowledgments ("yeah", "okay", "got it"), repeating back
   Most TrackMan screencasts are predominantly coach narration. When unclear, default to "coach".

2. Break the lesson into TOPICAL SEGMENTS. Each segment is a coherent coaching theme, typically 10–60 seconds. Each gets a dominant_speaker.

3. Identify named TOPICS discussed. Concepts like "grip", "swing plane", "face angle", "weight shift", "club path". Each mention gets a speaker label.
   Categories: fundamentals, mechanics, mental, short-game, putting, equipment.

4. Identify named DRILLS demonstrated or referenced. Named practice exercises like "L-to-L drill", "step drill", "pump drill", "gate drill". Each mention gets a speaker label. Only mark something as a drill if it has a clear name — generic instructions like "rotate your shoulders" are NOT drills.
   Categories: tempo, sequencing, face control, path, balance, setup.

For each topic / drill mention, also capture:
  - start_seconds, end_seconds: exact time range from the transcript
  - quote: a direct quote from the transcript showing the mention

Output JSON only, in this exact schema:

{
  "speaker_turns": [
    {"start_seconds": 0.0, "end_seconds": 17.9, "speaker": "coach"},
    {"start_seconds": 17.9, "end_seconds": 18.2, "speaker": "student"}
  ],
  "segments": [
    {
      "start_seconds": 0.0,
      "end_seconds": 17.9,
      "title": "Diagnosing club position",
      "summary": "Coach explains why the club is behind the player, comparing right palm orientation to pro references.",
      "key_points": ["Right palm too open", "Pro comparison"],
      "dominant_speaker": "coach"
    }
  ],
  "topics": [
    {"name": "Grip", "category": "fundamentals", "start_seconds": 25.6, "end_seconds": 33.6, "quote": "looking at his right palm", "speaker": "coach"}
  ],
  "drills": [
    {"name": "L-to-L drill", "category": "tempo", "start_seconds": 12.0, "end_seconds": 24.0, "quote": "do the L-to-L drill ten times", "speaker": "coach"}
  ]
}

Use canonical golf terminology. Prefer fewer, well-named topics/drills over many fuzzy ones. If no drills are clearly named, return an empty array. Speaker values are exactly "coach" or "student" (lowercase).

Output only the JSON. No prose, no markdown fences.
"""


def _gather_text_in_range(whisper_segments: list, start: float, end: float) -> str:
    """Pull the transcript words that fall inside [start, end] from whisper output."""
    eps = 0.05
    return " ".join(
        w["text"].strip()
        for w in whisper_segments
        if w["start"] >= start - eps and w["end"] <= end + eps
    )


def build_vocabulary_block(db: Database) -> str:
    """Build a text block listing the canonical topic + drill names already
    in the DB. Prepended to the user message so the LLM stays consistent
    with prior extractions across runs (e.g., emits "Club Path" not
    "Club path", reuses "Setup" instead of inventing "Setup / Address").

    Cheap (~500-1000 input tokens for a settled vocabulary) and dramatically
    reduces the post-ingest dedup workload."""
    topics = db.list_topics()
    drills = db.list_drills()
    if not topics and not drills:
        return ""

    from collections import defaultdict

    by_cat: dict[tuple[str, Optional[str]], list[str]] = defaultdict(list)
    for t in topics:
        cat = t.category or "other"
        by_cat[(cat, t.subcategory)].append(t.name)

    lines = [
        "EXISTING TOPIC VOCABULARY — prefer these exact names if they describe",
        "what the coach is discussing. Only invent a new topic name when the",
        "concept is genuinely not in this list. Match casing exactly.",
        "",
    ]
    cat_order = ["fundamentals", "mechanics", "mental", "short-game", "putting", "equipment", "other"]
    grouped_keys = sorted(
        by_cat.keys(),
        key=lambda k: (
            cat_order.index(k[0]) if k[0] in cat_order else 999,
            "" if k[1] is None else k[1],
        ),
    )
    for cat, sub in grouped_keys:
        label = f"  [{cat}" + (f" / {sub}" if sub else "") + "]"
        for name in sorted(by_cat[(cat, sub)]):
            lines.append(f"{label} {name}")

    if drills:
        lines.append("")
        lines.append("EXISTING DRILL VOCABULARY — same rule:")
        for d in sorted(drills, key=lambda x: x.name):
            lines.append(f"  - {d.name}")
    return "\n".join(lines)


def analyze_transcript(
    video_id: int,
    db: Database,
    model: str = DEFAULT_MODEL,
    client: Optional[anthropic.Anthropic] = None,
) -> dict:
    """Run Claude analysis on a transcribed video. Returns parsed JSON.

    Inserts segments, topic_mentions, drill_mentions. Updates videos.status.
    """
    if client is None:
        client = anthropic.Anthropic()

    video = db.get_video(video_id)
    transcript = db.get_transcript_for_video(video_id)
    if transcript is None:
        raise ValueError(f"video {video_id} has no transcript")

    whisper_segments = json.loads(transcript.segments_json or "[]")
    transcript_block = "\n".join(
        f"[{s['start']:.1f} - {s['end']:.1f}]: {s['text'].strip()}"
        for s in whisper_segments
    )

    vocabulary = build_vocabulary_block(db)
    user_msg_parts = []
    if vocabulary:
        user_msg_parts.append(vocabulary)
        user_msg_parts.append("")
    user_msg_parts.append(f"Lesson: {video.filename}")
    user_msg_parts.append(f"Duration: {video.duration_seconds:.1f}s")
    user_msg_parts.append("")
    user_msg_parts.append(f"Transcript with timestamps:\n{transcript_block}")
    user_msg_parts.append("")
    user_msg_parts.append("Analyze and produce JSON per the schema.")
    user_msg = "\n".join(user_msg_parts)

    db.log_processing(ProcessingLog(
        stage="analyze", status="started", video_id=video_id,
    ))
    start = time.time()

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4000,
            system=[{
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as e:
        db.log_processing(ProcessingLog(
            stage="analyze", status="failed", video_id=video_id, error=str(e),
        ))
        raise

    elapsed_ms = int((time.time() - start) * 1000)
    text = response.content[0].text.strip()

    # Tolerate accidental markdown fences
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.lstrip().lower().startswith("json"):
            text = text.split("\n", 1)[1]
        text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        db.log_processing(ProcessingLog(
            stage="analyze", status="failed", video_id=video_id,
            error=f"JSON parse failed: {e}\n--- response head ---\n{text[:400]}",
        ))
        raise

    # Persist speaker_turns on the existing transcripts row
    speaker_turns = data.get("speaker_turns", [])
    db.conn.execute(
        "UPDATE transcripts SET speakers_json = ? WHERE video_id = ?",
        (json.dumps(speaker_turns), video_id),
    )
    db.conn.commit()

    # Insert segments, remember their ids so mentions can link to them
    inserted_segments: list[tuple[float, float, int]] = []  # (start, end, id)
    for s in data.get("segments", []):
        s_start = float(s["start_seconds"])
        s_end = float(s["end_seconds"])
        seg_id = db.insert_segment(Segment(
            video_id=video_id,
            start_seconds=s_start,
            end_seconds=s_end,
            title=s.get("title"),
            summary=s.get("summary"),
            key_points_json=json.dumps(s.get("key_points", [])),
            transcript_text=_gather_text_in_range(whisper_segments, s_start, s_end),
            dominant_speaker=s.get("dominant_speaker"),
        ))
        inserted_segments.append((s_start, s_end, seg_id))

    def _segment_id_for(start: float, end: float) -> Optional[int]:
        end = end if end is not None else start
        for s_start, s_end, sid in inserted_segments:
            if s_start - 0.5 <= start and end <= s_end + 0.5:
                return sid
        return None

    # Topic mentions
    for t in data.get("topics", []):
        topic_id = db.find_or_create_topic(t["name"], category=t.get("category"))
        m_start = float(t["start_seconds"])
        m_end = float(t["end_seconds"]) if t.get("end_seconds") is not None else None
        db.insert_topic_mention(TopicMention(
            video_id=video_id,
            segment_id=_segment_id_for(m_start, m_end if m_end is not None else m_start),
            topic_id=topic_id,
            start_seconds=m_start,
            end_seconds=m_end,
            quote=t.get("quote"),
            speaker=t.get("speaker"),
        ))

    # Drill mentions
    for d in data.get("drills", []):
        drill_id = db.find_or_create_drill(
            d["name"], description=d.get("description"), category=d.get("category"),
        )
        m_start = float(d["start_seconds"])
        m_end = float(d["end_seconds"]) if d.get("end_seconds") is not None else None
        db.insert_drill_mention(DrillMention(
            video_id=video_id,
            segment_id=_segment_id_for(m_start, m_end if m_end is not None else m_start),
            drill_id=drill_id,
            start_seconds=m_start,
            end_seconds=m_end,
            quote=d.get("quote"),
            speaker=d.get("speaker"),
        ))

    db.update_video_status(video_id, "analyzed")

    # Sonnet 4.6 pricing: $3/MTok in, $15/MTok out
    in_tok = response.usage.input_tokens
    out_tok = response.usage.output_tokens
    cost_cents = (in_tok * 3.0 / 1_000_000 + out_tok * 15.0 / 1_000_000) * 100

    db.log_processing(ProcessingLog(
        stage="analyze", status="success", video_id=video_id,
        duration_ms=elapsed_ms, cost_cents=cost_cents,
    ))

    return data


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze transcribed videos with Claude.")
    parser.add_argument("--db", type=Path, default=Path("data/golf_coach_demo.db"))
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--limit", type=int, help="only analyze N videos")
    parser.add_argument("--video-id", type=int, help="analyze just this id")
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        print("error: ANTHROPIC_API_KEY not set (expected in .env.local at project root)",
              file=sys.stderr)
        sys.exit(1)

    db = Database(args.db)

    if args.video_id:
        ids = [args.video_id]
    else:
        videos = db.list_videos(status="transcribed", limit=args.limit)
        ids = [v.id for v in videos]

    if not ids:
        print("no transcribed videos waiting for analysis")
        return

    print(f"analyzing {len(ids)} videos with {args.model}\n")
    client = anthropic.Anthropic()

    for i, vid in enumerate(ids, 1):
        video = db.get_video(vid)
        print(f"  [{i}/{len(ids)}] id={vid}  {video.filename} ...", flush=True)
        try:
            result = analyze_transcript(vid, db, model=args.model, client=client)
        except Exception as e:
            print(f"    FAILED: {e}")
            continue
        n_seg = len(result.get("segments", []))
        n_top = len(result.get("topics", []))
        n_drill = len(result.get("drills", []))
        print(f"    ok  segments={n_seg}  topic_mentions={n_top}  drill_mentions={n_drill}")

    db.close()


if __name__ == "__main__":
    main()
