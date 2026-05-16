"""Transcribe classified lesson videos using MLX Whisper.

MLX Whisper runs locally on Apple Silicon (Neural Engine + GPU). Roughly
5–10× realtime on M-series hardware. First call downloads the model
(~1.5GB for large-v3-turbo).

Reusable entry point: transcribe_video(path) -> TranscriptionResult.
CLI: walks all videos with status='classified', transcribes each, writes
results into the transcripts table, and updates status to 'transcribed'.

Audio extraction is handled by mlx-whisper internally via ffmpeg.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import mlx_whisper

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "db"))

from database import Database
from models import Transcript, ProcessingLog

# whisper-large-v3-turbo: fast on M-series, accurate enough for the
# technical golf vocabulary (draw, fade, dynamic loft, spin axis, etc.).
# Swap to whisper-large-v3 for max accuracy, or whisper-medium.en for
# faster English-only runs.
DEFAULT_MODEL = "mlx-community/whisper-large-v3-turbo"


@dataclass
class TranscriptionResult:
    full_text: str
    segments: list[dict]    # whisper segments: each has 'start', 'end', 'text'
    language: str
    word_count: int
    elapsed_ms: int


def transcribe_video(
    video_path: Path | str,
    model: str = DEFAULT_MODEL,
) -> TranscriptionResult:
    """Transcribe a single video file. mlx-whisper extracts audio via ffmpeg."""
    video_path = Path(video_path)
    start = time.time()
    result = mlx_whisper.transcribe(
        str(video_path),
        path_or_hf_repo=model,
        verbose=False,
    )
    elapsed_ms = int((time.time() - start) * 1000)

    full_text: str = (result.get("text") or "").strip()
    segments: list[dict] = result.get("segments", []) or []
    language: str = result.get("language", "en")

    return TranscriptionResult(
        full_text=full_text,
        segments=segments,
        language=language,
        word_count=len(full_text.split()),
        elapsed_ms=elapsed_ms,
    )


def transcribe_and_store(
    video_id: int,
    db: Database,
    model: str = DEFAULT_MODEL,
) -> bool:
    """Transcribe one video row and write to transcripts.

    Updates videos.status -> 'transcribed' on success, logs every attempt
    to processing_log either way.
    """
    video = db.get_video(video_id)
    if video is None:
        raise ValueError(f"video id {video_id} not found")

    db.log_processing(ProcessingLog(
        stage="transcribe", status="started", video_id=video_id,
    ))

    try:
        result = transcribe_video(video.file_path, model=model)
    except Exception as e:
        db.log_processing(ProcessingLog(
            stage="transcribe", status="failed", video_id=video_id, error=str(e),
        ))
        return False

    db.insert_transcript(Transcript(
        video_id=video_id,
        full_text=result.full_text,
        segments_json=json.dumps(result.segments),
        language=result.language,
        word_count=result.word_count,
    ))
    db.update_video_status(video_id, "transcribed")
    db.log_processing(ProcessingLog(
        stage="transcribe", status="success", video_id=video_id,
        duration_ms=result.elapsed_ms,
    ))
    return True


def _format_seconds(s: float) -> str:
    m, sec = divmod(int(s), 60)
    return f"{m}:{sec:02d}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe classified videos with MLX Whisper.")
    parser.add_argument("--db", type=Path, default=Path("data/golf_coach_demo.db"))
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help=f"HuggingFace MLX model (default: {DEFAULT_MODEL})")
    parser.add_argument("--limit", type=int, help="only process N videos")
    parser.add_argument("--video-id", type=int,
                        help="transcribe just this video id (overrides --limit)")
    parser.add_argument("--shortest-first", action="store_true",
                        help="process shortest classified videos first (handy for testing)")
    args = parser.parse_args()

    db = Database(args.db)

    if args.video_id:
        ids_to_run = [args.video_id]
    else:
        videos = db.list_videos(status="classified")
        if args.shortest_first:
            videos = sorted(videos, key=lambda v: v.duration_seconds or 0.0)
        if args.limit:
            videos = videos[: args.limit]
        ids_to_run = [v.id for v in videos]

    if not ids_to_run:
        print("no classified videos waiting for transcription")
        return

    print(f"model: {args.model}")
    print(f"videos to transcribe: {len(ids_to_run)}")
    print("(first run downloads ~1.5GB model from HuggingFace)\n")

    for i, vid_id in enumerate(ids_to_run, 1):
        video = db.get_video(vid_id)
        dur = _format_seconds(video.duration_seconds or 0)
        print(f"  [{i:3}/{len(ids_to_run)}] id={vid_id}  {video.filename}  dur={dur} ...",
              flush=True)
        ok = transcribe_and_store(vid_id, db, model=args.model)
        if ok:
            t = db.get_transcript_for_video(vid_id)
            elapsed = db.conn.execute(
                "SELECT duration_ms FROM processing_log "
                "WHERE video_id=? AND stage='transcribe' AND status='success' "
                "ORDER BY id DESC LIMIT 1", (vid_id,),
            ).fetchone()
            elapsed_s = (elapsed["duration_ms"] / 1000) if elapsed else 0
            print(f"            ok  words={t.word_count}  lang={t.language}  "
                  f"elapsed={elapsed_s:.1f}s")
        else:
            print(f"            FAILED — see processing_log for error")

    db.close()


if __name__ == "__main__":
    main()
