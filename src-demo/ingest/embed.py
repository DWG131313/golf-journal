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

# Chunking parameters. 300-token windows with 50-token overlap split long
# segments into focused, individually-embeddable pieces while keeping
# enough context bleed at boundaries that a mid-sentence cut doesn't
# orphan the topic from neighboring chunks.
CHUNK_MAX_TOKENS = 300
CHUNK_OVERLAP_TOKENS = 50


def chunk_segment_text(text, tokenizer, max_tokens=CHUNK_MAX_TOKENS, overlap=CHUNK_OVERLAP_TOKENS):
    """Split text into overlapping token windows, returning original-text slices.

    Uses the embedder's own tokenizer (BertTokenizerFast) with offset_mapping
    so each returned chunk_text is a verbatim slice of the input — citations
    stay readable instead of being a decode round-trip.

    Returns a list of (chunk_text, chunk_index) tuples. Segments shorter than
    max_tokens emit as a single chunk with index 0 and no overlap.
    """
    text = (text or "").strip()
    if not text:
        return []

    enc = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
    offsets = enc["offset_mapping"]
    n_tokens = len(offsets)

    if n_tokens <= max_tokens:
        return [(text, 0)]

    stride = max_tokens - overlap
    chunks = []
    idx = 0
    start = 0
    while start < n_tokens:
        end = min(start + max_tokens, n_tokens)
        char_start = offsets[start][0]
        char_end = offsets[end - 1][1]
        piece = text[char_start:char_end].strip()
        if piece:
            chunks.append((piece, idx))
            idx += 1
        if end >= n_tokens:
            break
        start += stride
    return chunks


def embed_video(
    video_id: int,
    db: Database,
    model_obj: SentenceTransformer,
    model_name: str = DEFAULT_MODEL,
) -> int:
    """Embed all segments of a video. Returns number of chunks inserted.

    Each segment is split into <=300-token windows with 50-token overlap via
    chunk_segment_text. chunk_index is local to the segment (resets at each
    new segment_id), so multiple chunks per segment are ordered by position
    within the segment, not globally within the video.
    """
    segments = db.list_segments_for_video(video_id)
    if not segments:
        return 0

    db.log_processing(ProcessingLog(
        stage="embed", status="started", video_id=video_id,
    ))
    start = time.time()

    try:
        # Build the flat list of (segment, chunk_text, chunk_index) tuples
        # first, then batch-encode all chunks in a single forward pass.
        plan: list[tuple] = []
        for seg in segments:
            raw = (seg.transcript_text or seg.summary or seg.title or "").strip()
            for chunk_text, chunk_idx in chunk_segment_text(raw, model_obj.tokenizer):
                plan.append((seg, chunk_text, chunk_idx))

        if not plan:
            db.update_video_status(video_id, "embedded")
            return 0

        texts = [t for (_, t, _) in plan]
        embeddings = model_obj.encode(texts, show_progress_bar=False)

        for (seg, chunk_text, chunk_idx), emb in zip(plan, embeddings):
            db.insert_chunk(
                Chunk(
                    video_id=video_id,
                    segment_id=seg.id,
                    chunk_text=chunk_text,
                    chunk_index=chunk_idx,
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
    return len(plan)


def main() -> None:
    parser = argparse.ArgumentParser(description="Embed analyzed segments locally.")
    parser.add_argument("--db", type=Path, default=Path("data/golf_coach_demo.db"))
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--video-id", type=int)
    parser.add_argument(
        "--reembed-all",
        action="store_true",
        help="Wipe all chunks for already-embedded videos and re-embed from scratch.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip confirmation prompt when running destructive --reembed-all.",
    )
    args = parser.parse_args()

    db = Database(args.db)

    if args.reembed_all:
        videos = db.list_videos(status="embedded")
        if args.video_id:
            videos = [v for v in videos if v.id == args.video_id]
        if not videos:
            print("no embedded videos to wipe")
            return
        n_chunks = db.conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        print(f"reembed-all will delete {n_chunks} chunks across {len(videos)} videos")
        if not args.force:
            resp = input("proceed? [y/N] ").strip().lower()
            if resp != "y":
                print("aborted")
                return
        for v in videos:
            wiped = db.wipe_chunks_for_video(v.id)
            db.update_video_status(v.id, "analyzed")
            print(f"  wiped {wiped:3d} chunks for vid={v.id}  {v.filename}")
        ids = [v.id for v in videos]
    elif args.video_id:
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
