"""Audio-based classifier for golf videos.

Decides if a file is a lesson (has coach dialogue) or a silent swing clip.
Run on each new video before transcription/analysis.

Approach: ffprobe for duration + audio-stream presence, then ffmpeg
silencedetect to total up silent seconds. speech_seconds < threshold
means "skip".

The reusable entry point is classify_video(). It has no DB or filesystem
side effects — callers decide what to do with the result.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

DEFAULT_SPEECH_THRESHOLD_SECONDS = 5.0

# silencedetect tuning. -30dB is loud enough to ignore room hiss and
# club-on-ball thwack but quiet enough to keep ordinary speech.
# 0.5s minimum silence span avoids registering brief pauses.
SILENCE_NOISE_DB = "-30dB"
SILENCE_MIN_DURATION = 0.5


@dataclass
class ClassificationResult:
    file_path: Path
    duration_seconds: float
    speech_seconds: float
    is_lesson: bool                  # True if speech_seconds >= threshold
    file_hash: str                   # SHA256 of file contents
    has_audio: bool
    error: Optional[str] = None      # set if classification failed (e.g., corrupt file)


def classify_video(
    path: Path | str,
    speech_threshold_seconds: float = DEFAULT_SPEECH_THRESHOLD_SECONDS,
) -> ClassificationResult:
    """Classify a single video file.

    Returns is_lesson=False for silent clips, corrupt files, or files
    without an audio stream. Caller is responsible for moving files
    and writing DB rows.
    """
    path = Path(path)

    try:
        duration, audio_streams = _probe(path)
    except Exception as e:
        return ClassificationResult(
            file_path=path, duration_seconds=0.0, speech_seconds=0.0,
            is_lesson=False, file_hash="", has_audio=False,
            error=f"ffprobe failed: {e}",
        )

    file_hash = _hash_file(path)

    # No audio stream → definitely silent, no need to invoke silencedetect.
    if audio_streams == 0:
        return ClassificationResult(
            file_path=path, duration_seconds=duration, speech_seconds=0.0,
            is_lesson=False, file_hash=file_hash, has_audio=False,
        )

    try:
        silent_seconds = _detect_silence(path, duration)
    except Exception as e:
        return ClassificationResult(
            file_path=path, duration_seconds=duration, speech_seconds=0.0,
            is_lesson=False, file_hash=file_hash, has_audio=True,
            error=f"silencedetect failed: {e}",
        )

    speech_seconds = max(0.0, duration - silent_seconds)
    return ClassificationResult(
        file_path=path,
        duration_seconds=duration,
        speech_seconds=speech_seconds,
        is_lesson=speech_seconds >= speech_threshold_seconds,
        file_hash=file_hash,
        has_audio=True,
    )


# ---------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------
def _probe(path: Path) -> tuple[float, int]:
    """Return (duration_seconds, audio_stream_count) in one ffprobe call."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration:stream=codec_type",
            "-of", "json", str(path),
        ],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(result.stdout)
    duration = float(data["format"]["duration"])
    audio_count = sum(
        1 for s in data.get("streams", []) if s.get("codec_type") == "audio"
    )
    return duration, audio_count


def _detect_silence(path: Path, total_duration: float) -> float:
    """Sum the silent seconds in `path` via ffmpeg silencedetect.

    Parses stderr lines like:
        [silencedetect @ ...] silence_start: 1.234
        [silencedetect @ ...] silence_end: 5.678 | silence_duration: 4.444
    """
    result = subprocess.run(
        [
            "ffmpeg", "-i", str(path), "-af",
            f"silencedetect=noise={SILENCE_NOISE_DB}:d={SILENCE_MIN_DURATION}",
            "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    log = result.stderr
    starts = [float(m.group(1)) for m in re.finditer(r"silence_start: ([\d.]+)", log)]
    ends = [float(m.group(1)) for m in re.finditer(r"silence_end: ([\d.]+)", log)]

    # If a silence runs to the end of the file, ffmpeg may not emit
    # a closing silence_end. Cap it at total_duration.
    if len(starts) > len(ends):
        ends.append(total_duration)

    total_silent = sum(e - s for s, e in zip(starts, ends))
    return min(total_silent, total_duration)


def _hash_file(path: Path, chunk_size: int = 1 << 20) -> str:
    """SHA256 of file contents — used by callers to dedupe across runs."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()


# Public alias so callers can do `from classify import hash_file`.
hash_file = _hash_file


def faststart_video(path: Path) -> bool:
    """Rewrite an mp4 in-place with the moov atom at the front.

    Uses `ffmpeg -c copy -movflags +faststart`. No re-encoding.
    Writes to a .faststart.mp4 sibling temp file, then atomically
    replaces the original. The .mp4 extension on the temp file is
    required so ffmpeg can infer the output format.

    Returns True on success, False on failure (leaves original untouched).
    """
    temp_path = path.with_suffix(".faststart.mp4")
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(path),
            "-c", "copy", "-movflags", "+faststart",
            str(temp_path),
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        if temp_path.exists():
            temp_path.unlink()
        return False
    temp_path.replace(path)
    return True


# ---------------------------------------------------------------------
# Date extraction from TrackMan filenames
# ---------------------------------------------------------------------
# TrackMan portal:  "..._ScreenCapture_5-8-2026_4.28.31_PM.mp4"
_SCREENCAP_RE = re.compile(
    r"ScreenCapture_(\d{1,2})-(\d{1,2})-(\d{4})_(\d{1,2})\.(\d{2})\.(\d{2})_(AM|PM)",
    re.IGNORECASE,
)
# TrackMan native:  "2024-07-23_145011_<hex>.mov"
_NATIVE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})")
# Plain date fallback
_DATE_ONLY_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")


def extract_recorded_at(path: Path) -> Optional[datetime]:
    """Best-effort: parse recorded_at from filename, fall back to mtime."""
    name = path.stem

    m = _SCREENCAP_RE.search(name)
    if m:
        try:
            month, day, year, hour, minute, second, ampm = m.groups()
            hour = int(hour)
            if ampm.upper() == "PM" and hour != 12:
                hour += 12
            elif ampm.upper() == "AM" and hour == 12:
                hour = 0
            return datetime(
                int(year), int(month), int(day), hour, int(minute), int(second)
            )
        except (ValueError, TypeError):
            pass

    m = _NATIVE_RE.search(name)
    if m:
        try:
            y, mo, d, h, mi, s = m.groups()
            return datetime(int(y), int(mo), int(d), int(h), int(mi), int(s))
        except ValueError:
            pass

    m = _DATE_ONLY_RE.search(name)
    if m:
        try:
            y, mo, d = m.groups()
            return datetime(int(y), int(mo), int(d))
        except ValueError:
            pass

    return datetime.fromtimestamp(path.stat().st_mtime)
