from unittest.mock import patch, MagicMock
from pathlib import Path
import pytest

from pipeline.src.frames import build_ffmpeg_command, extract_keyframes


def test_build_ffmpeg_command_interval():
    cmd = build_ffmpeg_command("/tmp/video.mp4", "/tmp/frames", interval_seconds=10)
    assert isinstance(cmd, list)
    assert cmd[0] == "ffmpeg"
    assert "-i" in cmd
    assert "/tmp/video.mp4" in cmd
    # Check that the fps filter uses the interval
    vf_index = cmd.index("-vf")
    assert "fps=1/10" in cmd[vf_index + 1]
    # Output pattern should be last
    assert cmd[-1].startswith("/tmp/frames/")
    assert cmd[-1].endswith(".png")


@patch("pipeline.src.frames.subprocess.run")
@patch("pipeline.src.frames.get_video_duration")
def test_extract_keyframes(mock_duration, mock_run, tmp_data_dir):
    mock_duration.return_value = 30.0
    mock_run.return_value = MagicMock(returncode=0)

    # Create fake frame files that ffmpeg would produce
    lesson_dir = tmp_data_dir / "frames" / "lesson-1"
    lesson_dir.mkdir(parents=True, exist_ok=True)
    for i in range(6):
        (lesson_dir / f"frame_00_00_{i:02d}.png").touch()

    result = extract_keyframes(
        str(tmp_data_dir / "test.mov"),
        str(tmp_data_dir / "frames"),
        lesson_id="lesson-1",
        interval_seconds=5,
    )

    assert result["lesson_id"] == "lesson-1"
    assert result["frame_count"] == 6
    assert len(result["frame_files"]) == 6
    assert "frames_dir" in result
    mock_run.assert_called_once()
    mock_duration.assert_called_once()


@patch("pipeline.src.frames.subprocess.run")
@patch("pipeline.src.frames.get_video_duration")
def test_extract_keyframes_failure(mock_duration, mock_run, tmp_data_dir):
    mock_duration.return_value = 30.0
    mock_run.return_value = MagicMock(returncode=1, stderr="ffmpeg error")

    with pytest.raises(RuntimeError):
        extract_keyframes(
            str(tmp_data_dir / "test.mov"),
            str(tmp_data_dir / "frames"),
            lesson_id="lesson-1",
        )
