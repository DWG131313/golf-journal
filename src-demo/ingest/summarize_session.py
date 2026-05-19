"""Generate editorial title + 1-2 sentence summary for a coaching session.

Reads all segments across every video in a session and asks Claude (Sonnet 4.6)
to synthesize:
  - title:   editorial headline ~60-80 chars (e.g. "Hand path corrections,
             grip work, and tempo drills")
  - summary: 1-2 sentence recap useful on the lesson detail hero

Writes both to `sessions.title` and `sessions.summary`.

Why this exists: the library page used to fall back to the first segment of
the first video as the "session title" — fine for single-video sessions,
misleading for multi-video coaching days where one segment captures only
one topic. This stage runs once a session's videos are all embedded.

CLI:
    python summarize_session.py [--db PATH] [--session-id N] [--all] [--force]

By default, --all skips sessions whose `title` is already populated.
--force re-runs and overwrites.
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

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_DB = PROJECT_ROOT / "data" / "golf_coach_demo.db"

SYSTEM_PROMPT = """You are a golf coaching archivist writing editorial headlines for a personal lesson journal.

Given the segments and summaries across every video in a single coaching session, write:
  - title: a concise editorial headline, 60-90 characters, no trailing period.
           Capture what the SESSION as a whole was about — name the 2-3 most
           significant themes (grip, path, tempo, posture, drill name, etc.),
           not a single segment's micro-topic. Avoid generic openers like
           "Coaching session on..." or "Lesson covering...". Use commas or
           " · " to separate themes if there are multiple. Title-Case minor.
  - summary: 1-2 sentences (max ~240 characters total). Plain prose, no list.
             What the student worked on, in coach-narrative voice. Mention
             specific drills or coaching points if they were the focus.

Output STRICT JSON only, no prose around it:
  {"title": "...", "summary": "..."}
"""


def fetch_session_context(db: Database, session_id: int) -> dict:
    """Pull session + every segment in every video in the session."""
    session = db.get_session(session_id)
    if session is None:
        raise ValueError(f"session {session_id} not found")

    video_rows = db.conn.execute(
        """
        SELECT v.id, v.filename, v.recorded_at, v.duration_seconds
        FROM session_videos sv
        JOIN videos v ON v.id = sv.video_id
        WHERE sv.session_id = ?
        ORDER BY v.recorded_at, sv.sequence
        """,
        (session_id,),
    ).fetchall()

    videos = []
    for vr in video_rows:
        segments = db.conn.execute(
            """
            SELECT start_seconds, end_seconds, title, summary, key_points_json
            FROM segments
            WHERE video_id = ?
            ORDER BY start_seconds
            """,
            (vr["id"],),
        ).fetchall()
        videos.append({"video": vr, "segments": segments})

    return {"session": session, "videos": videos}


def build_user_message(ctx: dict) -> str:
    session = ctx["session"]
    videos = ctx["videos"]
    n_videos = len(videos)
    n_segments = sum(len(v["segments"]) for v in videos)

    lines: list[str] = []
    lines.append(f"Session date: {session.date}")
    lines.append(
        f"This session contains {n_videos} video{'s' if n_videos != 1 else ''} "
        f"with {n_segments} coached segments total."
    )
    lines.append("")

    for i, v in enumerate(videos, 1):
        vrow = v["video"]
        dur = vrow["duration_seconds"]
        lines.append(f"--- VIDEO {i}/{n_videos} ({dur:.0f}s, {len(v['segments'])} segments) ---")
        for seg in v["segments"]:
            start = seg["start_seconds"]
            end = seg["end_seconds"]
            mm_start = f"{int(start)//60}:{int(start)%60:02d}"
            mm_end = f"{int(end)//60}:{int(end)%60:02d}"
            title = seg["title"] or "(untitled)"
            summary = (seg["summary"] or "").strip()
            lines.append(f"  [{mm_start}-{mm_end}] {title}")
            if summary:
                lines.append(f"    {summary}")
            kp_raw = seg["key_points_json"]
            if kp_raw:
                try:
                    kps = json.loads(kp_raw)
                    if isinstance(kps, list) and kps:
                        joined = " • ".join(str(k) for k in kps[:5])
                        lines.append(f"    Key points: {joined}")
                except json.JSONDecodeError:
                    pass
        lines.append("")

    lines.append(
        "Write the title + summary as JSON. Capture the session as a whole, "
        "not just the first segment."
    )
    return "\n".join(lines)


def summarize_session(
    session_id: int,
    db: Database,
    model: str = DEFAULT_MODEL,
    client: Optional[anthropic.Anthropic] = None,
) -> dict:
    """Generate title + summary for one session. Returns parsed dict."""
    if client is None:
        client = anthropic.Anthropic()

    ctx = fetch_session_context(db, session_id)
    if not ctx["videos"]:
        raise ValueError(f"session {session_id} has no videos linked")
    if all(not v["segments"] for v in ctx["videos"]):
        raise ValueError(f"session {session_id} has no analyzed segments")

    user_msg = build_user_message(ctx)

    start = time.time()
    response = client.messages.create(
        model=model,
        max_tokens=400,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    elapsed = time.time() - start

    text = "".join(
        block.text for block in response.content if block.type == "text"
    ).strip()

    # Strip code fences if Claude wrapped the JSON.
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        text = text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"session {session_id}: model did not return JSON: {text[:200]}") from e

    title = (parsed.get("title") or "").strip()
    summary = (parsed.get("summary") or "").strip()
    if not title:
        raise RuntimeError(f"session {session_id}: empty title in response")

    db.conn.execute(
        "UPDATE sessions SET title = ?, summary = ? WHERE id = ?",
        (title, summary, session_id),
    )
    db.conn.commit()

    return {
        "session_id": session_id,
        "title": title,
        "summary": summary,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "elapsed_seconds": elapsed,
    }


def list_sessions_to_summarize(db: Database, force: bool) -> list[int]:
    """Return session ids that need a title.

    A session is eligible when every video linked to it has reached
    'embedded' status. With force=False, sessions whose title is already
    populated are skipped.
    """
    query = """
        SELECT s.id
        FROM sessions s
        WHERE EXISTS (SELECT 1 FROM session_videos sv WHERE sv.session_id = s.id)
          AND NOT EXISTS (
            SELECT 1 FROM session_videos sv
            JOIN videos v ON v.id = sv.video_id
            WHERE sv.session_id = s.id AND v.status != 'embedded'
          )
    """
    if not force:
        query += " AND (s.title IS NULL OR length(trim(s.title)) = 0)"
    query += " ORDER BY s.date"
    return [row["id"] for row in db.conn.execute(query)]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", type=Path, default=DEFAULT_DB)
    p.add_argument("--session-id", type=int, help="single session to summarize")
    p.add_argument("--all", action="store_true",
                   help="summarize every fully-embedded session")
    p.add_argument("--force", action="store_true",
                   help="overwrite existing title+summary")
    p.add_argument("--model", default=DEFAULT_MODEL)
    args = p.parse_args()

    if not args.session_id and not args.all:
        p.error("specify --session-id N or --all")

    if not os.getenv("ANTHROPIC_API_KEY"):
        print("error: ANTHROPIC_API_KEY not set (expected in .env.local)", file=sys.stderr)
        return 2

    db = Database(args.db)

    if args.session_id:
        ids = [args.session_id]
    else:
        ids = list_sessions_to_summarize(db, force=args.force)
        if not ids:
            print("no sessions ready to summarize (need all videos embedded)")
            return 0

    print(f"summarizing {len(ids)} session{'s' if len(ids) != 1 else ''} with {args.model}")
    client = anthropic.Anthropic()
    total_in = total_out = 0
    failed = 0
    for sid in ids:
        try:
            result = summarize_session(sid, db, model=args.model, client=client)
        except Exception as e:
            print(f"  session {sid}: FAILED — {e}", file=sys.stderr)
            failed += 1
            continue
        total_in += result["input_tokens"]
        total_out += result["output_tokens"]
        print(
            f"  session {sid}: \"{result['title']}\" "
            f"({result['input_tokens']}↓ {result['output_tokens']}↑, "
            f"{result['elapsed_seconds']:.1f}s)"
        )

    print(
        f"\ndone: {len(ids) - failed}/{len(ids)} sessions  "
        f"({total_in}↓ {total_out}↑ total tokens)"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
