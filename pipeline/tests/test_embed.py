from unittest.mock import patch, MagicMock
from typing import List

from pipeline.src.models import Segment, Chunk
from pipeline.src.embed import chunk_segments, generate_embeddings


def _make_segment(**overrides) -> Segment:
    """Build a Segment with sensible defaults; override any field via kwargs."""
    defaults = dict(
        lesson_id="lesson-1",
        segment_index=0,
        start_time=0.0,
        end_time=30.0,
        topic="Grip",
        categories=["fundamentals"],
        coach_tips=["Keep left thumb straight"],
        student_observations=["Tends to grip too tightly"],
        visual_context="Close-up of hands on club",
        summary="Discussion about proper grip technique.",
        frames=["frame_001.png", "frame_002.png"],
        transcript="So the grip is really important. You want a neutral grip.",
        speaker_map=None,
    )
    defaults.update(overrides)
    return Segment(**defaults)


def test_chunk_segments_short_segment():
    """A short segment produces at least 1 chunk with correct metadata."""
    seg = _make_segment()
    chunks = chunk_segments([seg])

    assert len(chunks) >= 1
    chunk = chunks[0]
    assert chunk.lesson_id == "lesson-1"
    assert chunk.segment_index == 0
    assert "grip" in chunk.text.lower()


def test_chunk_segments_includes_context():
    """Chunk text contains the topic and coach tips from the segment."""
    seg = _make_segment(
        topic="Driver Takeaway",
        coach_tips=["Keep clubhead outside hands"],
    )
    chunks = chunk_segments([seg])

    combined_text = " ".join(c.text for c in chunks)
    assert "Driver Takeaway" in combined_text
    assert "Keep clubhead outside hands" in combined_text


@patch("pipeline.src.embed._get_model")
def test_generate_embeddings(mock_get_model):
    """generate_embeddings returns the correct number of float vectors."""
    mock_model = MagicMock()
    # Return a list-of-lists (no numpy needed)
    mock_model.encode.return_value = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
    mock_get_model.return_value = mock_model

    result = generate_embeddings(["text one", "text two"])

    assert len(result) == 2
    assert len(result[0]) == 3
    assert isinstance(result[0][0], float)
    mock_model.encode.assert_called_once()
