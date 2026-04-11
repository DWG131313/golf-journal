import json
import subprocess
import re
from datetime import date
from pathlib import Path


def detect_source_type(source: str) -> str:
    if re.match(r"https?://(www\.)?(youtube\.com|youtu\.be)/", source):
        return "youtube"
    return "other"


def acquire_local(video_path: str, source_type: str = "other") -> dict:
    path = Path(video_path)
    if not path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")
    return {
        "video_path": str(path),
        "filename": path.name,
        "source_type": source_type,
        "source_url": None,
        "source_metadata": None,
        "lesson_id": f"{date.today().isoformat()}-{path.stem}",
    }


def acquire_youtube(url: str, download_dir: str) -> dict:
    download_path = Path(download_dir)
    download_path.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["yt-dlp", "--dump-json", "--no-download", url],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp metadata extraction failed: {result.stderr}")
    metadata = json.loads(result.stdout)
    video_id = metadata["id"]
    lesson_id = f"youtube-{video_id}"
    output_template = str(download_path / f"{lesson_id}.%(ext)s")
    dl_result = subprocess.run(
        ["yt-dlp", "-f", "best[ext=mp4]/best", "-o", output_template, url],
        capture_output=True, text=True,
    )
    if dl_result.returncode != 0:
        raise RuntimeError(f"yt-dlp download failed: {dl_result.stderr}")
    downloaded = list(download_path.glob(f"{lesson_id}.*"))
    video_path = str(downloaded[0]) if downloaded else output_template.replace("%(ext)s", "mp4")
    return {
        "video_path": video_path,
        "filename": Path(video_path).name,
        "source_type": "youtube",
        "source_url": url,
        "source_metadata": {
            "title": metadata.get("title"),
            "channel": metadata.get("channel"),
            "description": metadata.get("description"),
            "duration": metadata.get("duration"),
            "video_id": video_id,
        },
        "lesson_id": lesson_id,
    }
