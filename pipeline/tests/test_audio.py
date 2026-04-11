from unittest.mock import patch, MagicMock
from pipeline.src.audio import extract_audio


@patch("pipeline.src.audio.subprocess.run")
def test_extract_audio(mock_run, tmp_data_dir):
    mock_run.return_value = MagicMock(returncode=0)
    video_path = str(tmp_data_dir / "test.mov")
    output_dir = str(tmp_data_dir / "audio")
    result = extract_audio(video_path, output_dir, lesson_id="lesson-1")
    assert result.endswith("lesson-1.wav")
    mock_run.assert_called_once()
    cmd = mock_run.call_args[0][0]
    assert cmd[0] == "ffmpeg"
    assert "-vn" in cmd


@patch("pipeline.src.audio.subprocess.run")
def test_extract_audio_failure(mock_run, tmp_data_dir):
    mock_run.return_value = MagicMock(returncode=1, stderr="error")
    import pytest
    with pytest.raises(RuntimeError, match="ffmpeg audio extraction failed"):
        extract_audio(
            str(tmp_data_dir / "test.mov"),
            str(tmp_data_dir / "audio"),
            lesson_id="lesson-1",
        )
