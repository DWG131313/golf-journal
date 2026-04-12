import json
from pathlib import Path
from typing import Dict, List, Optional

# PyTorch 2.6+ defaults to weights_only=True in torch.load, which breaks
# whisperx/pyannote model loading. Force weights_only=False for compatibility.
import torch
_original_load = torch.load
def _patched_load(*args, **kwargs):
    kwargs["weights_only"] = False
    return _original_load(*args, **kwargs)
torch.load = _patched_load


def format_transcript(
    raw_segments: List[Dict],
    speaker_map: Optional[Dict[str, str]],
) -> List[Dict]:
    """Format whisperx raw segments: map speaker labels and strip text."""
    formatted = []
    for seg in raw_segments:
        entry = {
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"].strip(),
        }
        speaker = seg.get("speaker")
        if speaker is not None:
            if speaker_map and speaker in speaker_map:
                entry["speaker"] = speaker_map[speaker]
            else:
                entry["speaker"] = speaker
        formatted.append(entry)
    return formatted


def transcribe_audio(
    audio_path: str,
    output_dir: str,
    lesson_id: str,
    source_type: str,
    speaker_map: Optional[Dict[str, str]] = None,
    model_size: str = "base",
    hf_token: Optional[str] = None,
) -> str:
    """Transcribe audio with whisperx, optional diarization for coaching videos.

    Args:
        audio_path: Path to the audio file.
        output_dir: Directory to save the transcript JSON.
        lesson_id: Unique lesson identifier.
        source_type: Type of source ("coaching", "youtube", "other").
        speaker_map: Optional mapping of speaker labels to names.
        model_size: Whisperx model size (default "base").
        hf_token: HuggingFace token for diarization pipeline.

    Returns:
        Path to the saved transcript JSON file.
    """
    import whisperx  # lazy import — heavy dependency

    device = "cpu"
    compute_type = "int8"

    # Load model and transcribe
    model = whisperx.load_model(model_size, device=device, compute_type=compute_type)
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio, batch_size=16)

    # Align whisper output
    language = result.get("language", "en")
    align_model, metadata = whisperx.load_align_model(
        language_code=language, device=device,
    )
    result = whisperx.align(
        result["segments"], align_model, metadata, audio, device,
        return_char_alignments=False,
    )

    # Diarization (only for coaching videos with a HuggingFace token)
    if source_type == "coaching" and hf_token:
        diarize_model = whisperx.DiarizationPipeline(
            use_auth_token=hf_token, device=device,
        )
        diarize_segments = diarize_model(audio)
        result = whisperx.assign_word_speakers(diarize_segments, result)

    # Format transcript
    segments = format_transcript(result["segments"], speaker_map)

    # Build output
    transcript = {
        "lesson_id": lesson_id,
        "source_type": source_type,
        "segments": segments,
        "speaker_map": speaker_map,
    }

    # Save to disk
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    output_path = Path(output_dir) / f"{lesson_id}.json"
    with open(output_path, "w") as f:
        json.dump(transcript, f, indent=2)

    return str(output_path)
