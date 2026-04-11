import json
import os
from pathlib import Path


def test_load_config_from_file(tmp_path):
    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps({
        "ingestion": {
            "max_tokens_per_video": 100000,
            "frames_per_batch": 5,
            "frame_interval_seconds": 10,
            "require_confirmation": False,
        },
        "chat": {"daily_token_limit": 50000, "model": "claude-sonnet-4.6"},
        "paths": {"data_dir": "data", "db_path": "data/golf_coach.db"},
    }))

    from pipeline.src.config import load_config

    config = load_config(str(config_file))
    assert config.ingestion.max_tokens_per_video == 100000
    assert config.ingestion.frames_per_batch == 5
    assert config.ingestion.require_confirmation is False
    assert config.chat.daily_token_limit == 50000


def test_load_config_defaults(tmp_path):
    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps({}))

    from pipeline.src.config import load_config

    config = load_config(str(config_file))
    assert config.ingestion.max_tokens_per_video == 500000
    assert config.ingestion.frames_per_batch == 10
    assert config.ingestion.require_confirmation is True
    assert config.chat.daily_token_limit is None
