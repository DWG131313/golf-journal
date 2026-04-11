import json
from pathlib import Path
from typing import Optional
from pydantic import BaseModel


class IngestionConfig(BaseModel):
    max_tokens_per_video: int = 500000
    frames_per_batch: int = 10
    frame_interval_seconds: int = 5
    require_confirmation: bool = True


class ChatConfig(BaseModel):
    daily_token_limit: Optional[int] = None
    model: str = "claude-sonnet-4.6"


class PathsConfig(BaseModel):
    data_dir: str = "data"
    db_path: str = "data/golf_coach.db"


class AppConfig(BaseModel):
    ingestion: IngestionConfig = IngestionConfig()
    chat: ChatConfig = ChatConfig()
    paths: PathsConfig = PathsConfig()


def load_config(config_path: str) -> AppConfig:
    path = Path(config_path)
    if path.exists():
        with open(path) as f:
            data = json.load(f)
        return AppConfig(**data)
    return AppConfig()
