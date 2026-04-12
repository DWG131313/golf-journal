"""CLI orchestrator for end-to-end video ingestion pipeline."""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

from pipeline.src.acquire import acquire_local, acquire_youtube, detect_source_type
from pipeline.src.analyze import analyze_batch
from pipeline.src.audio import extract_audio
from pipeline.src.config import load_config, AppConfig
from pipeline.src.cost import CostTracker, estimate_tokens
from pipeline.src.db import Database
from pipeline.src.embed import chunk_segments, generate_embeddings
from pipeline.src.frames import extract_keyframes, get_video_duration
from pipeline.src.models import Lesson, Segment, Chunk, ProcessingLog
from pipeline.src.transcribe import transcribe_audio


# ---------------------------------------------------------------------------
# Stage helpers
# ---------------------------------------------------------------------------

def analyze_all_segments(
    transcript_segments: List[Dict],
    frames_result: Dict,
    source_type: str,
    cost_tracker: CostTracker,
    config: AppConfig,
    source_metadata: Optional[Dict] = None,
) -> List[Segment]:
    """Batch-analyze transcript segments into Segment models.

    Groups transcript segments into ~45-second time batches, finds
    matching frames for each batch, and calls analyze_batch.
    """
    if not transcript_segments:
        return []

    lesson_id = frames_result["lesson_id"]
    frame_files = frames_result.get("frame_files", [])
    frames_per_batch = config.ingestion.frames_per_batch
    interval = config.ingestion.frame_interval_seconds

    # Group transcript segments into ~45-second batches
    batch_duration = 45.0
    batches = []  # type: List[List[Dict]]
    current_batch = []  # type: List[Dict]
    batch_start = transcript_segments[0]["start"]

    for seg in transcript_segments:
        if seg["start"] - batch_start >= batch_duration and current_batch:
            batches.append(current_batch)
            current_batch = [seg]
            batch_start = seg["start"]
        else:
            current_batch.append(seg)
    if current_batch:
        batches.append(current_batch)

    segments = []  # type: List[Segment]

    for batch_idx, batch in enumerate(batches):
        # Check budget before each batch
        if not cost_tracker.is_within_budget():
            print(f"Budget exceeded after {batch_idx} batches. Stopping analysis.")
            break

        start_time = batch[0]["start"]
        end_time = batch[-1]["end"]

        # Join text with speaker labels
        text_parts = []  # type: List[str]
        for seg in batch:
            speaker = seg.get("speaker", "")
            prefix = f"[{speaker}] " if speaker else ""
            text_parts.append(prefix + seg["text"])
        transcript_chunk = "\n".join(text_parts)

        # Find frame files that fall within this batch's time range
        batch_frames = []  # type: List[str]
        for fpath in frame_files:
            # Frame filenames are like frame_HH_MM_SS.png
            fname = Path(fpath).stem
            parts = fname.split("_")
            if len(parts) >= 4:
                try:
                    h, m, s = int(parts[1]), int(parts[2]), int(parts[3])
                    frame_time = h * 3600 + m * 60 + s
                    if start_time <= frame_time <= end_time:
                        batch_frames.append(fpath)
                except (ValueError, IndexError):
                    pass

        # Limit frames to config.ingestion.frames_per_batch
        batch_frames = batch_frames[:frames_per_batch]

        # Call analysis (skip on failure to avoid crashing entire pipeline)
        try:
            result = analyze_batch(
                transcript_chunk=transcript_chunk,
                frame_paths=batch_frames,
                source_type=source_type,
                start_time=start_time,
                end_time=end_time,
                cost_tracker=cost_tracker,
                source_metadata=source_metadata,
                model=config.chat.model,
            )
        except Exception as exc:
            print(f"  WARNING: Analysis failed for batch {batch_idx + 1}: {exc}")
            result = {
                "topic": f"Segment {batch_idx + 1}",
                "categories": [],
                "coach_tips": [],
                "student_observations": [],
                "visual_context": "",
                "summary": transcript_chunk[:200],
            }

        # Skip segments with no coaching value
        coaching_value = result.get("coaching_value", "high")
        if coaching_value == "none":
            print(f"  Batch {batch_idx + 1}/{len(batches)}: "
                  f"{start_time:.1f}s-{end_time:.1f}s — skipped (no coaching value)")
            continue

        segment = Segment(
            lesson_id=lesson_id,
            segment_index=len(segments),  # re-index to avoid gaps
            start_time=start_time,
            end_time=end_time,
            topic=result.get("topic", ""),
            categories=result.get("categories", []),
            coach_tips=result.get("coach_tips", []),
            student_observations=result.get("student_observations", []),
            visual_context=result.get("visual_context", ""),
            summary=result.get("summary", ""),
            frames=batch_frames,
            transcript=transcript_chunk,
        )
        segments.append(segment)

        print(f"  Batch {batch_idx + 1}/{len(batches)}: "
              f"{start_time:.1f}s-{end_time:.1f}s — {cost_tracker.summary()}")

    return segments


def store_chunks(
    chunks: List[Chunk],
    embeddings: List[List[float]],
    db: Database,
) -> None:
    """Insert chunks with embeddings into the database via raw SQL."""
    for chunk, embedding in zip(chunks, embeddings):
        db.conn.execute(
            """INSERT INTO chunks (id, lesson_id, segment_index, text,
               embedding, start_time, end_time, frames)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                chunk.id,
                chunk.lesson_id,
                chunk.segment_index,
                chunk.text,
                json.dumps(embedding),
                chunk.start_time,
                chunk.end_time,
                json.dumps(chunk.frames),
            ),
        )
    db.conn.commit()


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def process_video(
    source: str,
    source_type: Optional[str] = None,
    config_path: str = "config.json",
    dry_run: bool = False,
    confirm_fn: Optional[Callable] = None,
    speaker_map: Optional[Dict[str, str]] = None,
    hf_token: Optional[str] = None,
) -> Dict:
    """Run the full ingestion pipeline on a single video source.

    Returns a dict with lesson_id, status, and additional details.
    """
    config = load_config(config_path)
    data_dir = config.paths.data_dir

    # --- Stage 0: Acquire video ---
    print("[Stage 0] Acquiring video...")
    if source_type is None:
        source_type = detect_source_type(source)

    if source_type == "youtube":
        download_dir = os.path.join(data_dir, "downloads")
        acquisition = acquire_youtube(source, download_dir)
    else:
        acquisition = acquire_local(source, source_type)

    video_path = acquisition["video_path"]
    lesson_id = acquisition["lesson_id"]
    filename = acquisition["filename"]
    source_url = acquisition.get("source_url")
    source_metadata = acquisition.get("source_metadata")

    print(f"  Lesson ID: {lesson_id}")
    print(f"  Video: {video_path}")

    # --- Dry run: estimate tokens and return early ---
    if dry_run:
        duration = get_video_duration(video_path)
        # Rough estimation: assume ~150 words/minute, 4 chars/word
        estimated_text = "x" * int(duration * 150 * 4 / 60)
        estimated_frame_count = int(duration / config.ingestion.frame_interval_seconds)
        estimated = estimate_tokens(estimated_text, estimated_frame_count)
        print(f"  [Dry run] Duration: {duration:.1f}s")
        print(f"  [Dry run] Estimated tokens: {estimated:,}")
        return {
            "lesson_id": lesson_id,
            "status": "dry_run",
            "estimated_tokens": estimated,
            "duration_seconds": duration,
        }

    # --- Confirmation ---
    if confirm_fn and not confirm_fn(lesson_id, video_path):
        return {"lesson_id": lesson_id, "status": "cancelled"}

    if config.ingestion.require_confirmation and confirm_fn is None:
        # Default interactive confirmation
        answer = input(f"Process {filename}? [y/N] ").strip().lower()
        if answer not in ("y", "yes"):
            return {"lesson_id": lesson_id, "status": "cancelled"}

    # --- Init DB and cost tracker ---
    db = Database(config.paths.db_path)
    cost_tracker = CostTracker(config.ingestion.max_tokens_per_video)

    try:
        # Insert lesson record
        lesson = Lesson(
            id=lesson_id,
            filename=filename,
            date=datetime.now().strftime("%Y-%m-%d"),
            source_type=source_type,
            source_url=source_url,
            source_metadata=source_metadata,
            processing_status="processing",
        )
        db.insert_lesson(lesson)

        # --- Stage 1: Extract audio ---
        print("[Stage 1] Extracting audio...")
        audio_dir = os.path.join(data_dir, "audio")
        audio_path = extract_audio(video_path, audio_dir, lesson_id)
        print(f"  Audio: {audio_path}")

        # --- Stage 2: Transcribe ---
        print("[Stage 2] Transcribing audio...")
        transcript_dir = os.path.join(data_dir, "transcripts")
        transcript_result = transcribe_audio(
            audio_path=audio_path,
            output_dir=transcript_dir,
            lesson_id=lesson_id,
            source_type=source_type,
            speaker_map=speaker_map,
            hf_token=hf_token,
        )

        # transcribe_audio may return a file path (str) or a dict
        if isinstance(transcript_result, str):
            with open(transcript_result, "r") as f:
                transcript_data = json.load(f)
        else:
            transcript_data = transcript_result

        transcript_segments = transcript_data.get("segments", [])
        print(f"  Segments: {len(transcript_segments)}")

        # --- Stage 3: Extract keyframes ---
        print("[Stage 3] Extracting keyframes...")
        frames_dir = os.path.join(data_dir, "frames")
        frames_result = extract_keyframes(
            video_path=video_path,
            output_dir=frames_dir,
            lesson_id=lesson_id,
            interval_seconds=config.ingestion.frame_interval_seconds,
        )
        print(f"  Frames: {frames_result['frame_count']}")

        # --- Stage 4: Analyze all segments ---
        print("[Stage 4] Analyzing segments...")
        segments = analyze_all_segments(
            transcript_segments=transcript_segments,
            frames_result=frames_result,
            source_type=source_type,
            cost_tracker=cost_tracker,
            config=config,
            source_metadata=source_metadata,
        )
        print(f"  Analyzed segments: {len(segments)}")

        # Store segments in DB
        for seg in segments:
            db.insert_segment(seg)

        # --- Stage 5: Chunk and embed ---
        print("[Stage 5] Chunking and embedding...")
        chunks = chunk_segments(segments)
        if chunks:
            texts = [c.text for c in chunks]
            embeddings = generate_embeddings(texts)
            store_chunks(chunks, embeddings, db)
        print(f"  Chunks: {len(chunks)}")

        # --- Finalize ---
        db.conn.execute(
            "UPDATE lessons SET processing_status = ?, segment_count = ? WHERE id = ?",
            ("completed", len(segments), lesson_id),
        )
        db.conn.commit()
        db.insert_processing_log(ProcessingLog(
            lesson_id=lesson_id,
            stage="ingestion",
            tokens_used=cost_tracker.total,
            timestamp=datetime.now().isoformat(),
            status="success",
            details=cost_tracker.summary(),
        ))

        print(f"\nDone! {cost_tracker.summary()}")

        return {
            "lesson_id": lesson_id,
            "status": "completed",
            "segments": len(segments),
            "chunks": len(chunks),
            "tokens_used": cost_tracker.total,
        }

    except Exception as exc:
        # Record failure
        db.update_lesson_status(lesson_id, "failed")
        db.insert_processing_log(ProcessingLog(
            lesson_id=lesson_id,
            stage="ingestion",
            tokens_used=cost_tracker.total,
            timestamp=datetime.now().isoformat(),
            status="error",
            details=str(exc),
        ))
        raise

    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    """Parse arguments and run the pipeline."""
    parser = argparse.ArgumentParser(
        description="Ingest a golf video into the knowledge base.",
    )
    parser.add_argument("source", help="Path to local video file or YouTube URL")
    parser.add_argument(
        "--type",
        dest="source_type",
        choices=["coaching", "youtube", "other"],
        default=None,
        help="Source type (auto-detected if omitted)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Estimate token cost without processing",
    )
    parser.add_argument(
        "--config",
        default="config.json",
        help="Path to config file (default: config.json)",
    )
    parser.add_argument(
        "--speaker-map",
        type=str,
        default=None,
        help='Speaker label mapping as JSON, e.g. \'{"SPEAKER_00":"Coach"}\'',
    )
    parser.add_argument(
        "--hf-token",
        default=None,
        help="HuggingFace token for speaker diarization",
    )
    parser.add_argument(
        "-y", "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )

    args = parser.parse_args()

    speaker_map = None
    if args.speaker_map:
        speaker_map = json.loads(args.speaker_map)

    confirm_fn = None
    if args.yes:
        confirm_fn = lambda lid, vp: True

    result = process_video(
        source=args.source,
        source_type=args.source_type,
        config_path=args.config,
        dry_run=args.dry_run,
        confirm_fn=confirm_fn,
        speaker_map=speaker_map,
        hf_token=args.hf_token,
    )

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
