"""Triage CLI: classify every video in a folder and route to DB or _skipped/.

Lesson videos → row in `videos` with status='classified'.
Silent clips  → moved to <folder>/_skipped/ and logged to `skipped_videos`.

The work-horse function is classify_and_route(), which is also what the
future drag-and-drop upload handler will call for a single file.

CLI:
    python triage.py <folder> [--db PATH] [--threshold SECONDS]
                              [--limit N] [--dry-run] [--source NAME]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from dataclasses import replace as dataclass_replace

# src-demo/ uses a hyphen so it can't be a Python package; inject the
# sibling db/ directory onto sys.path to import the access layer.
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "db"))
sys.path.insert(0, str(HERE))

from classify import (
    classify_video, extract_recorded_at, faststart_video, hash_file,
    DEFAULT_SPEECH_THRESHOLD_SECONDS,
)
from database import Database
from models import Video, SkippedVideo

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".avi", ".mkv"}


def classify_and_route(
    video_path: Path,
    db: Database,
    skipped_dir: Path,
    threshold: float = DEFAULT_SPEECH_THRESHOLD_SECONDS,
    source: str = "trackman",
    do_faststart: bool = True,
) -> tuple[str, dict]:
    """Classify a single video and route it.

    Returns (status, details) where status is one of:
      'kept'      — inserted into videos
      'skipped'   — moved to skipped_dir, logged to skipped_videos
      'duplicate' — already in DB by file_hash, no action taken
      'error'     — classification failed; file untouched
    """
    result = classify_video(video_path, speech_threshold_seconds=threshold)
    if result.error:
        return "error", {"error": result.error, "filename": video_path.name}

    # Duplicate check happens BEFORE faststart. Re-running ffmpeg faststart on an
    # already-faststart file produces slightly different bytes (timestamps in
    # metadata), so doing faststart first would drift the hash and miss the
    # duplicate detection, leading to duplicate rows on every re-triage.
    existing = db.get_video_by_hash(result.file_hash)
    if existing:
        return "duplicate", {
            "existing_id": existing.id,
            "filename": existing.filename,
        }

    if result.is_lesson and do_faststart:
        if faststart_video(video_path):
            # Bytes changed; refresh the hash so the DB row reflects the served file
            new_hash = hash_file(video_path)
            result = dataclass_replace(result, file_hash=new_hash)

    if result.is_lesson:
        recorded_at = extract_recorded_at(video_path)
        video_id = db.insert_video(Video(
            source=source,
            filename=video_path.name,
            file_path=str(video_path.resolve()),
            file_hash=result.file_hash,
            duration_seconds=result.duration_seconds,
            speech_seconds=result.speech_seconds,
            recorded_at=recorded_at,
            status="classified",
        ))
        # Auto-create the session this video belongs to + link it. A "session"
        # = a coaching day. Multiple recordings on the same date share one
        # session row; downstream UI iterates sessions, not raw videos.
        if recorded_at is not None:
            session_id = db.find_or_create_session_for_date(recorded_at.date())
            sequence = db.next_session_video_sequence(session_id)
            db.add_video_to_session(session_id, video_id, sequence=sequence)
        return "kept", {
            "video_id": video_id,
            "speech_seconds": round(result.speech_seconds, 1),
            "duration_seconds": round(result.duration_seconds, 1),
        }

    # Skip path: DB row first so failure leaves no orphan files.
    skipped_dir.mkdir(parents=True, exist_ok=True)
    target = skipped_dir / video_path.name
    db.insert_skipped_video(SkippedVideo(
        filename=video_path.name,
        original_path=str(video_path.resolve()),
        moved_to_path=str(target.resolve()),
        duration_seconds=result.duration_seconds,
        speech_seconds=result.speech_seconds,
        reason="silent_swing_clip",
    ))
    try:
        video_path.rename(target)
    except OSError as e:
        # Rare on same filesystem; surface so we can investigate
        return "error", {"error": f"rename failed: {e}", "filename": video_path.name}

    return "skipped", {
        "speech_seconds": round(result.speech_seconds, 1),
        "duration_seconds": round(result.duration_seconds, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Triage golf videos: classify and route to DB or _skipped/."
    )
    parser.add_argument("folder", type=Path, help="folder containing video files")
    parser.add_argument("--db", type=Path, default=Path("data/golf_coach_demo.db"))
    parser.add_argument("--threshold", type=float, default=DEFAULT_SPEECH_THRESHOLD_SECONDS,
                        help="speech-seconds threshold (default: 5.0)")
    parser.add_argument("--source", default="trackman",
                        help="value to use in videos.source (default: trackman)")
    parser.add_argument("--limit", type=int,
                        help="only process the first N files (handy for sampling)")
    parser.add_argument("--dry-run", action="store_true",
                        help="classify and print verdicts but don't move files or write DB")
    parser.add_argument("--no-faststart", action="store_true",
                        help="skip ffmpeg moov-atom rewrite for kept lessons")
    args = parser.parse_args()

    folder: Path = args.folder.resolve()
    if not folder.is_dir():
        print(f"error: not a directory: {folder}", file=sys.stderr)
        sys.exit(1)

    videos = sorted(p for p in folder.iterdir() if p.suffix.lower() in VIDEO_EXTS)
    if args.limit:
        videos = videos[: args.limit]
    if not videos:
        print(f"no video files found in {folder}")
        return

    skipped_dir = folder / "_skipped"

    print(f"classifying {len(videos)} videos  "
          f"(threshold: {args.threshold}s speech, dry_run={args.dry_run})\n")

    # TrackMan's silent swing clips often come as dual-camera pairs (down-the-line
    # + face-on) that share a to-the-second timestamp. We annotate these in the
    # output so they're visible during the run — useful sanity check and a place
    # to spot the rare mixed-audio pair where one camera caught speech.
    pair_first: dict[str, int] = {}        # pair key -> first-seen index
    pair_counts: dict[str, int] = {}       # pair key -> total occurrences

    def _pair_note(idx: int, vid_path: Path) -> str:
        rec = extract_recorded_at(vid_path)
        key = rec.strftime("%Y-%m-%d_%H:%M:%S") if rec else vid_path.name
        pair_counts[key] = pair_counts.get(key, 0) + 1
        if key in pair_first:
            return f"  ↩ pair of #{pair_first[key]}"
        pair_first[key] = idx
        return ""

    if args.dry_run:
        counts = {"kept": 0, "skipped": 0, "error": 0}
        for i, vid in enumerate(videos, 1):
            note = _pair_note(i, vid)
            r = classify_video(vid, speech_threshold_seconds=args.threshold)
            if r.error:
                verdict = "ERROR"
                counts["error"] += 1
            else:
                verdict = "KEEP " if r.is_lesson else "SKIP "
                counts["kept" if r.is_lesson else "skipped"] += 1
            print(f"  [{i:3}/{len(videos)}] {verdict}  speech={round(r.speech_seconds, 1):>6}s  "
                  f"dur={round(r.duration_seconds, 1):>6}s  {vid.name}{note}")
        n_groups = sum(1 for c in pair_counts.values() if c >= 2)
        n_files_in_pairs = sum(c for c in pair_counts.values() if c >= 2)
        print(f"\nsummary: kept={counts['kept']}  skipped={counts['skipped']}  "
              f"error={counts['error']}  paired_groups={n_groups} ({n_files_in_pairs} files)")
        return

    db = Database(args.db)
    db.init_schema()

    counts = {"kept": 0, "skipped": 0, "duplicate": 0, "error": 0}
    for i, vid in enumerate(videos, 1):
        note = _pair_note(i, vid)
        status, details = classify_and_route(
            vid, db, skipped_dir, args.threshold, args.source,
            do_faststart=not args.no_faststart,
        )
        counts[status] += 1
        speech = details.get("speech_seconds", "?")
        suffix = f" speech={speech}s"
        if status == "error":
            suffix = f"  ({details.get('error', '')})"
        elif status == "duplicate":
            suffix = f"  -> existing id={details.get('existing_id')}"
        print(f"  [{i:3}/{len(videos)}] {status.upper():<10} {vid.name}{suffix}{note}")

    print(
        f"\nsummary: kept={counts['kept']}  skipped={counts['skipped']}  "
        f"duplicate={counts['duplicate']}  error={counts['error']}"
    )
    db.close()


if __name__ == "__main__":
    main()
