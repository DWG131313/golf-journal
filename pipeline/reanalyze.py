"""Re-analyze existing lessons with the improved prompt.

Reads existing transcripts from the DB, re-runs Claude analysis with the
updated (more selective) prompt, filters out noise segments, and replaces
the old segments/chunks in the DB.

Usage:
    python -m pipeline.reanalyze              # re-analyze all lessons
    python -m pipeline.reanalyze LESSON_ID    # re-analyze one lesson
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from pipeline.src.analyze import analyze_batch
from pipeline.src.config import load_config
from pipeline.src.cost import CostTracker
from pipeline.src.db import Database
from pipeline.src.embed import chunk_segments, generate_embeddings
from pipeline.src.models import Segment, Chunk, ProcessingLog


def reanalyze_lesson(lesson_id: str, db: Database, config) -> Dict:
    """Re-analyze a single lesson's segments."""
    lesson = db.get_lesson(lesson_id)
    if not lesson:
        print(f"Lesson {lesson_id} not found")
        return {"status": "not_found"}

    # Read existing segments to get transcripts
    rows = db.conn.execute(
        "SELECT segment_index, start_time, end_time, transcript, frames "
        "FROM segments WHERE lesson_id = ? ORDER BY segment_index",
        (lesson_id,),
    ).fetchall()

    if not rows:
        print(f"No segments found for {lesson_id}")
        return {"status": "no_segments"}

    print(f"\nRe-analyzing {lesson_id}: {len(rows)} existing segments")

    cost_tracker = CostTracker(max_tokens_per_video=config.ingestion.max_tokens_per_video)
    new_segments = []
    skipped = 0

    for row in rows:
        transcript = row["transcript"]
        start_time = row["start_time"]
        end_time = row["end_time"]
        frames = json.loads(row["frames"]) if row["frames"] else []

        try:
            result = analyze_batch(
                transcript_chunk=transcript,
                frame_paths=frames,
                source_type=lesson.source_type,
                start_time=start_time,
                end_time=end_time,
                cost_tracker=cost_tracker,
                model=config.chat.model,
            )
        except Exception as exc:
            print(f"  WARNING: Analysis failed for {start_time:.1f}-{end_time:.1f}s: {exc}")
            result = {
                "coaching_value": "medium",
                "topic": f"Segment (analysis failed)",
                "categories": [],
                "coach_tips": [],
                "student_observations": [],
                "visual_context": "",
                "summary": transcript[:200],
            }

        coaching_value = result.get("coaching_value", "high")
        if coaching_value == "none":
            skipped += 1
            print(f"  {start_time:.1f}-{end_time:.1f}s — skipped (no coaching value)")
            continue

        segment = Segment(
            lesson_id=lesson_id,
            segment_index=len(new_segments),
            start_time=start_time,
            end_time=end_time,
            topic=result.get("topic", ""),
            categories=result.get("categories", []),
            coach_tips=result.get("coach_tips", []),
            student_observations=result.get("student_observations", []),
            visual_context=result.get("visual_context", ""),
            summary=result.get("summary", ""),
            frames=frames,
            transcript=transcript,
        )
        new_segments.append(segment)
        label = "★" if coaching_value == "high" else "·"
        print(f"  {label} {start_time:.1f}-{end_time:.1f}s — {result.get('topic', '?')}")

    # Replace old data
    print(f"\nReplacing: {len(rows)} old segments → {len(new_segments)} filtered ({skipped} skipped)")

    db.conn.execute("DELETE FROM segments WHERE lesson_id = ?", (lesson_id,))
    db.conn.execute("DELETE FROM chunks WHERE lesson_id = ?", (lesson_id,))

    for seg in new_segments:
        db.insert_segment(seg)

    # Re-embed
    chunks = chunk_segments(new_segments)
    if chunks:
        texts = [c.text for c in chunks]
        embeddings = generate_embeddings(texts)
        for chunk, emb in zip(chunks, embeddings):
            db.conn.execute(
                "INSERT INTO chunks (id, lesson_id, segment_index, text, embedding, start_time, end_time, frames) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (chunk.id, chunk.lesson_id, chunk.segment_index, chunk.text,
                 json.dumps(emb), chunk.start_time, chunk.end_time, json.dumps(chunk.frames)),
            )

    # Update lesson
    db.conn.execute(
        "UPDATE lessons SET segment_count = ?, processing_status = 'completed' WHERE id = ?",
        (len(new_segments), lesson_id),
    )
    db.conn.commit()

    print(f"  Chunks: {len(chunks)}")

    return {
        "lesson_id": lesson_id,
        "old_segments": len(rows),
        "new_segments": len(new_segments),
        "skipped": skipped,
    }


def main():
    config = load_config("config.json")
    db = Database(config.paths.db_path)

    if len(sys.argv) > 1:
        lesson_ids = [sys.argv[1]]
    else:
        rows = db.conn.execute("SELECT id FROM lessons ORDER BY id").fetchall()
        lesson_ids = [r["id"] for r in rows]

    results = []
    for lid in lesson_ids:
        result = reanalyze_lesson(lid, db, config)
        results.append(result)

    db.close()

    print("\n=== Summary ===")
    total_old = sum(r.get("old_segments", 0) for r in results)
    total_new = sum(r.get("new_segments", 0) for r in results)
    total_skipped = sum(r.get("skipped", 0) for r in results)
    print(f"  {total_old} segments → {total_new} kept, {total_skipped} filtered out")


if __name__ == "__main__":
    main()
