import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from pipeline.src.acquire import acquire_local, acquire_youtube, detect_source_type


def test_detect_source_type_youtube():
    assert detect_source_type("https://www.youtube.com/watch?v=abc123") == "youtube"
    assert detect_source_type("https://youtu.be/abc123") == "youtube"


def test_detect_source_type_local():
    assert detect_source_type("/path/to/video.mov") == "other"
    assert detect_source_type("/path/to/video.mp4") == "other"


def test_acquire_local(tmp_data_dir):
    video = tmp_data_dir / "test_video.mov"
    video.write_bytes(b"fake video data")
    result = acquire_local(str(video), source_type="coaching")
    assert result["video_path"] == str(video)
    assert result["source_type"] == "coaching"
    assert result["filename"] == "test_video.mov"


def test_acquire_local_file_not_found():
    import pytest
    with pytest.raises(FileNotFoundError):
        acquire_local("/nonexistent/video.mov", source_type="coaching")


@patch("pipeline.src.acquire.subprocess.run")
def test_acquire_youtube(mock_run, tmp_data_dir):
    mock_run.side_effect = [
        MagicMock(
            returncode=0,
            stdout=json.dumps({
                "title": "Perfect Driver Swing",
                "channel": "Golf Tips",
                "description": "Learn the perfect driver swing",
                "duration": 600,
                "id": "abc123",
            }),
        ),
        MagicMock(returncode=0),
    ]
    result = acquire_youtube(
        "https://www.youtube.com/watch?v=abc123",
        download_dir=str(tmp_data_dir / "downloads"),
    )
    assert result["source_type"] == "youtube"
    assert result["source_metadata"]["title"] == "Perfect Driver Swing"
    assert result["source_metadata"]["channel"] == "Golf Tips"
    assert result["lesson_id"] == "youtube-abc123"
