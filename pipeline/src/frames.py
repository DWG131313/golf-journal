import subprocess
from pathlib import Path
from typing import Dict, List


def get_video_duration(video_path: str) -> float:
    """Use ffprobe to get video duration in seconds."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    return float(result.stdout.strip())


def build_ffmpeg_command(
    video_path: str,
    output_dir: str,
    interval_seconds: int = 5,
) -> List[str]:
    """Build ffmpeg command for interval-based frame extraction."""
    return [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps=1/{interval_seconds}",
        "-frame_pts", "1",
        "-y",
        f"{output_dir}/frame_%02d_%02d_%02d.png",
    ]


def extract_keyframes(
    video_path: str,
    output_dir: str,
    lesson_id: str,
    interval_seconds: int = 5,
) -> Dict:
    """Extract keyframes from a video at the given interval.

    Creates a subdirectory for the lesson, runs ffmpeg, and returns
    metadata about the extracted frames.
    """
    duration = get_video_duration(video_path)

    lesson_dir = Path(output_dir) / lesson_id
    lesson_dir.mkdir(parents=True, exist_ok=True)

    cmd = build_ffmpeg_command(video_path, str(lesson_dir), interval_seconds)
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg keyframe extraction failed: {result.stderr}")

    frame_files = sorted(str(p) for p in lesson_dir.glob("*.png"))

    return {
        "lesson_id": lesson_id,
        "frames_dir": str(lesson_dir),
        "frame_files": frame_files,
        "frame_count": len(frame_files),
        "duration": duration,
        "interval_seconds": interval_seconds,
    }
