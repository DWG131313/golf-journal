"""Unified pipeline resume CLI.

Picks up any video at a non-terminal status (classified, transcribed,
analyzed) and pushes it forward stage-by-stage until status='embedded'.

Failures per video are caught, logged, and the batch continues.

CLI:
    python process.py [--db PATH] [--video-id N] [--limit N] [--dry-run]
"""
from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path
from typing import Optional

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "db"))
sys.path.insert(0, str(HERE))

from database import Database
from models import Video

# Stage function imports — these live in sibling modules.
# Heavy transitive deps (mlx_whisper, anthropic, sentence_transformers) are
# not loaded at import time; they're pulled in lazily by the stage modules
# or by our _get_* helpers below.
from transcribe import transcribe_and_store
from analyze import analyze_transcript, DEFAULT_MODEL as ANALYZE_DEFAULT
from embed import embed_video, DEFAULT_MODEL as EMBED_DEFAULT

# ---------------------------------------------------------------------------
# Stage dispatch table
# ---------------------------------------------------------------------------

# Maps the current video status to the name of the next stage to run.
# 'pending' is intentionally absent — classification requires file operations
# handled by a separate flow (triage.py / classify.py).
STAGE_BY_STATUS: dict[str, str] = {
    "classified": "transcribe",
    "transcribed": "analyze",
    "analyzed": "embed",
}

# Terminal status — nothing left to do.
TERMINAL_STATUS = "embedded"

# Non-terminal statuses this CLI will pick up.
RESUMABLE_STATUSES = list(STAGE_BY_STATUS.keys())

# ---------------------------------------------------------------------------
# Lazy model singletons — only loaded when needed
# ---------------------------------------------------------------------------

_anthropic_client = None
_embed_model = None


def _get_anthropic():
    """Return a cached Anthropic client, loading credentials from .env.local."""
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env.local")
        _anthropic_client = anthropic.Anthropic()
    return _anthropic_client


def _get_embed_model():
    """Return a cached SentenceTransformer, downloading on first call (~90MB)."""
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        print(f"  loading embedding model {EMBED_DEFAULT} (first run ~90MB)...")
        _embed_model = SentenceTransformer(EMBED_DEFAULT)
    return _embed_model


# ---------------------------------------------------------------------------
# Per-video processing
# ---------------------------------------------------------------------------

def process_one(video_id: int, db: Database) -> tuple[str, str]:
    """Push a single video forward through all remaining pipeline stages.

    Returns (final_status, message) where message is 'done', a stage note,
    or an error string starting with 'error:'.

    The loop is capped at 5 iterations to guard against unexpected cycles.
    """
    video = db.get_video(video_id)
    if video is None:
        return ("unknown", f"error: video id {video_id} not found")

    current_status = video.status

    for _iteration in range(5):
        if current_status == TERMINAL_STATUS:
            return (TERMINAL_STATUS, "done")

        if current_status == "pending":
            warnings.warn(
                f"video id={video_id} is 'pending' — classification requires "
                "triage.py/classify.py; skipping",
                stacklevel=2,
            )
            return (current_status, "unsupported status: pending")

        stage = STAGE_BY_STATUS.get(current_status)
        if stage is None:
            return (current_status, f"unsupported status: {current_status}")

        try:
            if stage == "transcribe":
                transcribe_and_store(video_id, db)

            elif stage == "analyze":
                client = _get_anthropic()
                analyze_transcript(video_id, db, model=ANALYZE_DEFAULT, client=client)

            elif stage == "embed":
                model_obj = _get_embed_model()
                embed_video(video_id, db, model_obj=model_obj, model_name=EMBED_DEFAULT)

        except Exception as e:
            return (current_status, f"error: {e}")

        # Re-fetch to get the updated status set by the stage function.
        refreshed = db.get_video(video_id)
        current_status = refreshed.status if refreshed else current_status

    # Fell out of the loop without reaching terminal — shouldn't happen.
    return (current_status, "error: loop cap reached without reaching embedded")


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------

def process_all(
    db: Database,
    limit: Optional[int] = None,
    dry_run: bool = False,
) -> dict[str, int]:
    """Process all videos at non-terminal statuses.

    Returns a tally dict: keys are final statuses (or 'errors'), values are
    counts.
    """
    # Gather videos across all resumable statuses, preserving id order.
    candidates: list[Video] = []
    for status in RESUMABLE_STATUSES:
        candidates.extend(db.list_videos(status=status))
    # Sort by id for deterministic ordering.
    candidates.sort(key=lambda v: v.id or 0)

    if limit is not None:
        candidates = candidates[:limit]

    if not candidates:
        print("no non-terminal videos found — nothing to do")
        return {}

    total = len(candidates)
    tally: dict[str, int] = {}

    for i, video in enumerate(candidates, 1):
        vid_id = video.id
        start_status = video.status
        next_stage = STAGE_BY_STATUS.get(start_status, "?")

        if dry_run:
            print(
                f"  [{i}/{total}] id={vid_id}  ({start_status}) "
                f"→ would run: {next_stage}"
            )
            tally[start_status] = tally.get(start_status, 0) + 1
            continue

        final_status, message = process_one(vid_id, db)

        # Derive a short outcome label for the status line.
        if message == "done" or message.startswith("unsupported"):
            outcome = message
        elif message.startswith("error:"):
            outcome = "FAILED"
        else:
            outcome = message

        print(
            f"  [{i}/{total}] id={vid_id}  ({start_status}) "
            f"→ {final_status}  {outcome}"
        )

        if message.startswith("error:"):
            tally["errors"] = tally.get("errors", 0) + 1
        else:
            tally[final_status] = tally.get(final_status, 0) + 1

    return tally


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Resume pipeline for non-terminal videos. "
            "Picks up classified/transcribed/analyzed videos and pushes each "
            "forward to 'embedded'."
        ),
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/golf_coach_demo.db"),
        help="path to SQLite DB (default: data/golf_coach_demo.db)",
    )
    parser.add_argument(
        "--video-id",
        type=int,
        metavar="N",
        help="process only this video id (bypasses status filter)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        metavar="N",
        help="cap the batch at N videos",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print plan without doing any work",
    )
    args = parser.parse_args()

    db = Database(args.db)

    if args.dry_run:
        print("=== DRY RUN — no changes will be made ===\n")

    if args.video_id is not None:
        # Single-video mode: process regardless of status filter.
        video = db.get_video(args.video_id)
        if video is None:
            print(f"error: video id={args.video_id} not found", file=sys.stderr)
            db.close()
            sys.exit(1)

        start_status = video.status
        next_stage = STAGE_BY_STATUS.get(start_status, "?")

        if args.dry_run:
            print(
                f"  id={args.video_id}  ({start_status}) "
                f"→ would run: {next_stage}"
            )
        else:
            final_status, message = process_one(args.video_id, db)
            outcome = "FAILED" if message.startswith("error:") else message
            print(
                f"  id={args.video_id}  ({start_status}) "
                f"→ {final_status}  {outcome}"
            )
            if message.startswith("error:"):
                print(f"  detail: {message}", file=sys.stderr)
    else:
        tally = process_all(db, limit=args.limit, dry_run=args.dry_run)

        if tally:
            print()
            print("=== Summary ===")
            errors = tally.pop("errors", 0)
            for status, count in sorted(tally.items()):
                print(f"  {status}: {count}")
            if errors:
                print(f"  errors: {errors}")

    # Session headline pass — generate title + summary for any session whose
    # videos are all embedded and don't have a title yet. Cheap (~3-4s per
    # session at Sonnet pricing). Failures here are logged but never break
    # the main pipeline; the user can rerun via summarize_session.py.
    if not args.dry_run:
        _summarize_completed_sessions(db)

    db.close()


def _summarize_completed_sessions(db: Database) -> None:
    """Run summarize_session.py over any session whose title is still NULL
    and whose videos have all reached 'embedded'."""
    try:
        from summarize_session import (
            list_sessions_to_summarize,
            summarize_session,
        )
    except ImportError as e:
        print(f"  warn: could not import session summarizer ({e})", file=sys.stderr)
        return

    ids = list_sessions_to_summarize(db, force=False)
    if not ids:
        return

    print()
    print(f"=== Session headlines ({len(ids)} pending) ===")
    try:
        import anthropic
        client = anthropic.Anthropic()
    except Exception as e:
        print(f"  warn: cannot summarize sessions — {e}", file=sys.stderr)
        return

    for sid in ids:
        try:
            result = summarize_session(sid, db, client=client)
            print(f"  session {sid}: \"{result['title']}\"")
        except Exception as e:
            print(f"  session {sid}: FAILED — {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
