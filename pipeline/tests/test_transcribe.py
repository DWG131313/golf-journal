import json
import sys
from unittest.mock import patch, MagicMock
from pipeline.src.transcribe import format_transcript, transcribe_audio


def test_format_transcript():
    raw_segments = [
        {"start": 0.0, "end": 2.5, "text": "  Hello there  ", "speaker": "SPEAKER_00"},
        {"start": 2.5, "end": 5.0, "text": " Good swing ", "speaker": "SPEAKER_01"},
    ]
    speaker_map = {"SPEAKER_00": "Coach", "SPEAKER_01": "Student"}
    result = format_transcript(raw_segments, speaker_map)
    assert len(result) == 2
    assert result[0]["speaker"] == "Coach"
    assert result[0]["text"] == "Hello there"
    assert result[0]["start"] == 0.0
    assert result[0]["end"] == 2.5
    assert result[1]["speaker"] == "Student"
    assert result[1]["text"] == "Good swing"


def test_format_transcript_no_speaker_map():
    raw_segments = [
        {"start": 0.0, "end": 2.5, "text": "  Hello there  ", "speaker": "SPEAKER_00"},
        {"start": 2.5, "end": 5.0, "text": " Good swing "},
    ]
    result = format_transcript(raw_segments, None)
    assert len(result) == 2
    assert result[0]["speaker"] == "SPEAKER_00"
    assert result[0]["text"] == "Hello there"
    assert result[1].get("speaker") is None
    assert result[1]["text"] == "Good swing"


def test_transcribe_audio_coaching(tmp_data_dir):
    mock_wx = MagicMock()

    # Setup mock model
    mock_model = MagicMock()
    mock_wx.load_model.return_value = mock_model
    mock_model.transcribe.return_value = {
        "segments": [
            {"start": 0.0, "end": 2.5, "text": " Keep your head down ", "speaker": "SPEAKER_00"},
            {"start": 2.5, "end": 5.0, "text": " Like this? ", "speaker": "SPEAKER_01"},
        ],
        "language": "en",
    }

    # Setup mock alignment
    mock_align_model = MagicMock()
    mock_metadata = MagicMock()
    mock_wx.load_align_model.return_value = (mock_align_model, mock_metadata)
    aligned_result = {
        "segments": [
            {"start": 0.0, "end": 2.5, "text": " Keep your head down ", "speaker": "SPEAKER_00"},
            {"start": 2.5, "end": 5.0, "text": " Like this? ", "speaker": "SPEAKER_01"},
        ],
    }
    mock_wx.align.return_value = aligned_result

    # Setup mock diarization
    mock_diarize_model = MagicMock()
    mock_wx.DiarizationPipeline.return_value = mock_diarize_model
    mock_diarize_model.return_value = "diarize_segments"
    diarized_result = {
        "segments": [
            {"start": 0.0, "end": 2.5, "text": " Keep your head down ", "speaker": "SPEAKER_00"},
            {"start": 2.5, "end": 5.0, "text": " Like this? ", "speaker": "SPEAKER_01"},
        ],
    }
    mock_wx.assign_word_speakers.return_value = diarized_result

    # Setup mock audio load
    mock_wx.load_audio.return_value = "fake_audio"

    # Create a fake audio file
    audio_path = str(tmp_data_dir / "audio" / "lesson-1.wav")
    with open(audio_path, "w") as f:
        f.write("fake")

    output_dir = str(tmp_data_dir / "transcripts")
    speaker_map = {"SPEAKER_00": "Coach", "SPEAKER_01": "Student"}

    with patch.dict(sys.modules, {"whisperx": mock_wx}):
        result = transcribe_audio(
            audio_path=audio_path,
            output_dir=output_dir,
            lesson_id="lesson-1",
            source_type="coaching",
            speaker_map=speaker_map,
            model_size="base",
            hf_token="fake-token",
        )

    # Verify output path
    assert result.endswith("lesson-1.json")

    # Verify JSON was written
    with open(result) as f:
        data = json.load(f)

    assert data["lesson_id"] == "lesson-1"
    assert data["source_type"] == "coaching"
    assert len(data["segments"]) == 2
    assert data["segments"][0]["speaker"] == "Coach"
    assert data["segments"][0]["text"] == "Keep your head down"
    assert data["segments"][1]["speaker"] == "Student"
    assert data["speaker_map"] == speaker_map

    # Verify whisperx was called correctly
    mock_wx.load_model.assert_called_once_with("base", device="cpu", compute_type="int8")
    mock_wx.load_audio.assert_called_once_with(audio_path)
    mock_model.transcribe.assert_called_once_with("fake_audio", batch_size=16)
    mock_wx.load_align_model.assert_called_once()
    mock_wx.align.assert_called_once()
    mock_wx.DiarizationPipeline.assert_called_once_with(use_auth_token="fake-token", device="cpu")
    mock_wx.assign_word_speakers.assert_called_once()
