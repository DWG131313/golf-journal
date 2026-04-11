import subprocess
from pathlib import Path


def extract_audio(video_path: str, output_dir: str, lesson_id: str) -> str:
    output_path = Path(output_dir) / f"{lesson_id}.wav"
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            "ffmpeg", "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            "-y",
            str(output_path),
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extraction failed: {result.stderr}")
    return str(output_path)
