"""Local embedding stage.

Reads videos at status='analyzed', encodes each segment's transcript_text
with sentence-transformers (384-dim, matches our chunks_vec schema),
writes chunks + vectors via Database.insert_chunk (which keeps the
chunks.id == chunks_vec.rowid invariant).

Updates videos.status -> 'embedded' on success.

Runs entirely offline — no API calls, no cost.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from sentence_transformers import SentenceTransformer

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "db"))

from database import Database
from models import Chunk, ProcessingLog

DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def embed_video(
    video_id: int,
    db: Database,
    model_obj: SentenceTransformer,
    model_name: str = DEFAULT_MODEL,
) -> int:
    """Embed all segments of a video. Returns number of chunks inserted."""
    segments = db.list_segments_for_video(video_id)
    if not segments:
        return 0

    db.log_processing(ProcessingLog(
        stage="embed", status="started", video_id=video_id,
    ))
    start = time.time()

    try:
        texts = [
            (s.transcript_text or s.summary or s.title or "").strip()
            for s in segments
        ]
        embeddings = model_obj.encode(texts, show_progress_bar=False)

        for i, (seg, emb) in enumerate(zip(segments, embeddings)):
            db.insert_chunk(
                Chunk(
                    video_id=video_id,
                    segment_id=seg.id,
                    chunk_text=texts[i],
                    chunk_index=i,
                    embedding_model=model_name,
                ),
                emb.tolist(),
            )
    except Exception as e:
        db.log_processing(ProcessingLog(
            stage="embed", status="failed", video_id=video_id, error=str(e),
        ))
        raise

    elapsed_ms = int((time.time() - start) * 1000)
    db.update_video_status(video_id, "embedded")
    db.log_processing(ProcessingLog(
        stage="embed", status="success", video_id=video_id, duration_ms=elapsed_ms,
    ))
    return len(segments)


def main() -> None:
    parser = argparse.ArgumentParser(description="Embed analyzed segments locally.")
    parser.add_argument("--db", type=Path, default=Path("data/golf_coach_demo.db"))
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--video-id", type=int)
    args = parser.parse_args()

    db = Database(args.db)

    if args.video_id:
        ids = [args.video_id]
    else:
        videos = db.list_videos(status="analyzed", limit=args.limit)
        ids = [v.id for v in videos]

    if not ids:
        print("no analyzed videos waiting for embedding")
        return

    print(f"loading {args.model} (first run downloads ~90MB)...")
    model = SentenceTransformer(args.model)
    print(f"embedding {len(ids)} videos\n")

    total = 0
    for i, vid in enumerate(ids, 1):
        video = db.get_video(vid)
        print(f"  [{i}/{len(ids)}] id={vid}  {video.filename} ...", end="", flush=True)
        n = embed_video(vid, db, model, args.model)
        total += n
        print(f"  {n} chunks")

    print(f"\ntotal chunks embedded: {total}")
    db.close()


if __name__ == "__main__":
    main()
