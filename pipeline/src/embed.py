"""Segment chunking and local embedding generation."""

import uuid
from typing import List, Optional

from pipeline.src.models import Segment, Chunk

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
MAX_CHUNK_CHARS = 2000

# ---------------------------------------------------------------------------
# Lazy-loaded model singleton
# ---------------------------------------------------------------------------

_model = None


def _get_model():
    """Return a cached SentenceTransformer instance (loaded once)."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def _build_header(seg: Segment) -> str:
    """Build the enriched metadata header for a segment."""
    lines = [
        f"Topic: {seg.topic}",
        f"Categories: {', '.join(seg.categories)}",
    ]
    if seg.coach_tips:
        lines.append("Coach tips: " + "; ".join(seg.coach_tips))
    if seg.student_observations:
        lines.append("Student observations: " + "; ".join(seg.student_observations))
    if seg.visual_context:
        lines.append(f"Visual context: {seg.visual_context}")
    if seg.summary:
        lines.append(f"Summary: {seg.summary}")
    return "\n".join(lines)


def _split_at_sentences(text: str, max_chars: int) -> List[str]:
    """Split *text* into pieces of at most *max_chars*, breaking at '. '."""
    parts: List[str] = []
    sentences = text.split(". ")
    current = ""
    for i, sentence in enumerate(sentences):
        # Re-add the period+space that was consumed by split, except for last
        suffix = ". " if i < len(sentences) - 1 else ""
        candidate = sentence + suffix
        if current and len(current) + len(candidate) > max_chars:
            parts.append(current)
            current = candidate
        else:
            current += candidate
    if current:
        parts.append(current)
    return parts


def chunk_segments(segments: List[Segment]) -> List[Chunk]:
    """Convert a list of Segments into retrieval-ready Chunks.

    Each chunk contains an enriched text block (metadata header +
    transcript).  If the text exceeds MAX_CHUNK_CHARS it is split at
    sentence boundaries, with the header repeated in every piece.
    """
    chunks: List[Chunk] = []

    for seg in segments:
        header = _build_header(seg)
        enriched = header + "\n\nTranscript:\n" + seg.transcript

        if len(enriched) <= MAX_CHUNK_CHARS:
            chunks.append(Chunk(
                id=str(uuid.uuid4()),
                lesson_id=seg.lesson_id,
                segment_index=seg.segment_index,
                text=enriched,
                start_time=seg.start_time,
                end_time=seg.end_time,
                frames=seg.frames,
            ))
        else:
            # Split transcript at sentence boundaries
            transcript_parts = _split_at_sentences(seg.transcript, MAX_CHUNK_CHARS - len(header) - 20)
            duration = seg.end_time - seg.start_time
            n_parts = len(transcript_parts)

            for idx, part in enumerate(transcript_parts):
                # Approximate time range for this sub-chunk
                part_start = seg.start_time + duration * idx / n_parts
                part_end = seg.start_time + duration * (idx + 1) / n_parts
                chunk_text = header + "\n\nTranscript:\n" + part

                chunks.append(Chunk(
                    id=str(uuid.uuid4()),
                    lesson_id=seg.lesson_id,
                    segment_index=seg.segment_index,
                    text=chunk_text,
                    start_time=round(part_start, 2),
                    end_time=round(part_end, 2),
                    frames=seg.frames,
                ))

    return chunks


# ---------------------------------------------------------------------------
# Embedding generation
# ---------------------------------------------------------------------------

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Encode *texts* into dense vectors using the local embedding model.

    Returns a list of float-lists, one per input text.
    """
    model = _get_model()
    vectors = model.encode(texts, convert_to_numpy=True)

    # Handle both numpy arrays (.tolist()) and plain lists
    if hasattr(vectors, "tolist"):
        return vectors.tolist()
    # Already plain lists (e.g. in mocked tests)
    return [
        [float(v) for v in vec]
        for vec in vectors
    ]
