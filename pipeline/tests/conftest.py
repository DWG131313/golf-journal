import json
import pytest
from pathlib import Path


@pytest.fixture
def tmp_data_dir(tmp_path):
    """Create a temporary data directory structure."""
    dirs = ["downloads", "frames", "audio", "transcripts"]
    for d in dirs:
        (tmp_path / d).mkdir()
    return tmp_path


@pytest.fixture
def sample_config(tmp_path):
    """Create a minimal config file and return its path."""
    config = {
        "ingestion": {
            "max_tokens_per_video": 100000,
            "frames_per_batch": 5,
            "frame_interval_seconds": 5,
            "require_confirmation": False,
        },
        "chat": {"daily_token_limit": None, "model": "claude-sonnet-4.6"},
        "paths": {"data_dir": str(tmp_path / "data"), "db_path": str(tmp_path / "data" / "golf_coach.db")},
    }
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps(config))
    (tmp_path / "data").mkdir()
    return str(config_path)
