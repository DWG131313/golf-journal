"""Tests for pipeline.ingest — CLI orchestrator."""

import json
from unittest.mock import patch, MagicMock

import pytest


@patch("pipeline.ingest.store_chunks")
@patch("pipeline.ingest.generate_embeddings")
@patch("pipeline.ingest.chunk_segments")
@patch("pipeline.ingest.analyze_all_segments")
@patch("pipeline.ingest.extract_keyframes")
@patch("pipeline.ingest.transcribe_audio")
@patch("pipeline.ingest.extract_audio")
@patch("pipeline.ingest.acquire_local")
def test_process_video_local(
    mock_acquire,
    mock_extract_audio,
    mock_transcribe,
    mock_keyframes,
    mock_analyze,
    mock_chunk,
    mock_embed,
    mock_store,
    tmp_path,
    sample_config,
):
    """Full pipeline orchestration calls each stage in order."""
    from pipeline.ingest import process_video

    lesson_id = "2026-04-11-test_video"

    mock_acquire.return_value = {
        "video_path": "/fake/video.mp4",
        "filename": "test_video.mp4",
        "source_type": "other",
        "source_url": None,
        "source_metadata": None,
        "lesson_id": lesson_id,
    }
    mock_extract_audio.return_value = "/fake/audio.wav"
    # transcribe_audio returns a file path string; process_video handles both
    # str and dict, so return a dict directly for simplicity in this test.
    mock_transcribe.return_value = {
        "lesson_id": lesson_id,
        "source_type": "other",
        "segments": [
            {"start": 0.0, "end": 10.0, "text": "Hello there", "speaker": "Coach"},
        ],
    }
    mock_keyframes.return_value = {
        "lesson_id": lesson_id,
        "frames_dir": "/fake/frames",
        "frame_files": ["/fake/frames/frame_00_00_00.png"],
        "frame_count": 1,
    }

    seg_mock = MagicMock()
    seg_mock.lesson_id = lesson_id
    seg_mock.segment_index = 0
    seg_mock.start_time = 0.0
    seg_mock.end_time = 10.0
    seg_mock.topic = "grip"
    seg_mock.categories = ["swing mechanics"]
    seg_mock.coach_tips = ["keep grip loose"]
    seg_mock.student_observations = []
    seg_mock.visual_context = "close-up of hands"
    seg_mock.summary = "Grip discussion"
    seg_mock.frames = ["/fake/frames/frame_00_00_00.png"]
    seg_mock.transcript = "Hello there"
    seg_mock.speaker_map = None
    mock_analyze.return_value = [seg_mock]

    chunk_mock = MagicMock()
    chunk_mock.id = "c1"
    chunk_mock.lesson_id = lesson_id
    chunk_mock.segment_index = 0
    chunk_mock.text = "chunk text"
    chunk_mock.start_time = 0.0
    chunk_mock.end_time = 10.0
    chunk_mock.frames = ["/fake/frames/frame_00_00_00.png"]
    mock_chunk.return_value = [chunk_mock]

    mock_embed.return_value = [[0.1, 0.2, 0.3]]

    result = process_video(
        source="/fake/video.mp4",
        source_type="other",
        config_path=sample_config,
    )

    assert result["lesson_id"] == lesson_id
    assert result["status"] == "completed"

    mock_acquire.assert_called_once()
    mock_extract_audio.assert_called_once()
    mock_transcribe.assert_called_once()
    mock_keyframes.assert_called_once()
    mock_analyze.assert_called_once()
    mock_chunk.assert_called_once()
    mock_embed.assert_called_once()
    mock_store.assert_called_once()


@patch("pipeline.ingest.get_video_duration")
@patch("pipeline.ingest.acquire_local")
def test_process_video_dry_run(
    mock_acquire,
    mock_duration,
    tmp_path,
    sample_config,
):
    """Dry-run mode estimates tokens and returns early."""
    from pipeline.ingest import process_video

    mock_acquire.return_value = {
        "video_path": "/fake/video.mp4",
        "filename": "test_video.mp4",
        "source_type": "other",
        "source_url": None,
        "source_metadata": None,
        "lesson_id": "2026-04-11-test_video",
    }
    mock_duration.return_value = 120.0  # 2-minute video

    result = process_video(
        source="/fake/video.mp4",
        source_type="other",
        config_path=sample_config,
        dry_run=True,
    )

    assert result["status"] == "dry_run"
    assert "estimated_tokens" in result
    mock_acquire.assert_called_once()
    mock_duration.assert_called_once()
