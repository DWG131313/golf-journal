# Golf Coach Knowledge Base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a system that extracts coaching knowledge from golf lesson videos (local + YouTube) into a searchable, browsable, and conversational knowledge base.

**Architecture:** A Python CLI ingestion pipeline processes videos through transcription, keyframe extraction, and multimodal analysis with Claude, storing structured data in SQLite with vector embeddings. A Next.js web app provides browse/search views and a RAG-powered chat interface.

**Tech Stack:** Python (ffmpeg, whisperx, yt-dlp, anthropic SDK, sentence-transformers), Next.js (App Router), Tailwind + shadcn/ui, AI SDK, SQLite + sqlite-vec, better-sqlite3

**Spec:** `docs/superpowers/specs/2026-04-09-golf-coach-knowledge-base-design.md`

---

## File Structure

### Python Pipeline (`pipeline/`)

```
pipeline/
  requirements.txt          # Python dependencies
  ingest.py                 # Main CLI entry point
  src/
    __init__.py
    config.py               # Load/validate config.json
    db.py                   # SQLite schema + CRUD operations
    models.py               # Pydantic data models (Lesson, Segment, Chunk)
    acquire.py              # Stage 0: local file + yt-dlp download
    audio.py                # Stage 1: ffmpeg audio extraction
    transcribe.py           # Stage 2: whisperx transcription + diarization
    frames.py               # Stage 3: ffmpeg keyframe extraction
    analyze.py              # Stage 4: Claude multimodal analysis
    embed.py                # Stage 5: chunking + embedding
    cost.py                 # Token tracking + budget enforcement
  tests/
    __init__.py
    conftest.py             # Shared fixtures (temp dirs, sample data)
    test_config.py
    test_db.py
    test_acquire.py
    test_audio.py
    test_transcribe.py
    test_frames.py
    test_analyze.py
    test_embed.py
    test_cost.py
    test_ingest.py
```

### Next.js App (project root)

```
src/
  lib/
    db.ts                   # better-sqlite3 + sqlite-vec access
    storage.ts              # Storage abstraction (read lessons, segments, chunks)
    embeddings.ts           # Query embedding via @huggingface/transformers
    search.ts               # Full-text + vector search logic
  app/
    layout.tsx              # Root layout with nav
    page.tsx                # Home — redirect to /lessons
    lessons/
      page.tsx              # Lesson index (cards)
      [id]/
        page.tsx            # Lesson detail (segments list)
        segments/
          [index]/
            page.tsx        # Segment detail (transcript + frames + tips)
    topics/
      page.tsx              # Topic outline tree
    search/
      page.tsx              # Search with filters
    chat/
      page.tsx              # RAG chat interface
    settings/
      page.tsx              # Cost dashboard
    lessons/
      new/
        page.tsx            # Add new lesson
    api/
      chat/
        route.ts            # AI SDK chat endpoint with RAG
      search/
        route.ts            # Search API
      ingest/
        route.ts            # Trigger pipeline from web UI
      lessons/
        route.ts            # Lessons CRUD API
  components/
    nav.tsx                 # Navigation sidebar/header
    segment-card.tsx        # Segment preview card (reused in search, topics, lesson detail)
    speaker-label.tsx       # Coach vs Danny label badge
    frame-gallery.tsx       # Inline frame display
    chat-message.tsx        # Chat message with citations + frames
    cost-badge.tsx          # Token usage indicator
```

### Shared

```
config.json                 # Cost controls + model config
data/                       # gitignored — all generated data
  golf_coach.db
  downloads/
  frames/
  audio/
  transcripts/
```

---

## Task 1: Python Pipeline — Project Setup + Data Models

**Files:**
- Create: `pipeline/requirements.txt`
- Create: `pipeline/src/__init__.py`
- Create: `pipeline/src/models.py`
- Create: `pipeline/src/config.py`
- Create: `config.json`
- Create: `pipeline/tests/__init__.py`
- Create: `pipeline/tests/conftest.py`
- Create: `pipeline/tests/test_config.py`

- [ ] **Step 1: Create Python virtual environment**

```bash
cd "/Users/dannygross/CodingProjects/Golf Coach"
python3 -m venv pipeline/.venv
```

- [ ] **Step 2: Create requirements.txt**

Create `pipeline/requirements.txt`:

```
pydantic>=2.0
anthropic>=0.40.0
sentence-transformers>=3.0
yt-dlp>=2024.0
pytest>=8.0
```

Note: `whisperx` and `ffmpeg-python` will be added when we reach those tasks — they have heavier dependencies (PyTorch) that need careful installation.

- [ ] **Step 3: Install dependencies**

```bash
source pipeline/.venv/bin/activate
pip install -r pipeline/requirements.txt
```

- [ ] **Step 4: Create config.json**

Create `config.json` at project root:

```json
{
  "ingestion": {
    "max_tokens_per_video": 500000,
    "frames_per_batch": 10,
    "frame_interval_seconds": 5,
    "require_confirmation": true
  },
  "chat": {
    "daily_token_limit": null,
    "model": "claude-sonnet-4.6"
  },
  "paths": {
    "data_dir": "data",
    "db_path": "data/golf_coach.db"
  }
}
```

- [ ] **Step 5: Write the failing test for config loading**

Create `pipeline/tests/test_config.py`:

```python
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
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd "/Users/dannygross/CodingProjects/Golf Coach"
source pipeline/.venv/bin/activate
python -m pytest pipeline/tests/test_config.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.src.config'`

- [ ] **Step 7: Implement config module**

Create `pipeline/src/__init__.py` (empty file).

Create `pipeline/src/config.py`:

```python
import json
from pathlib import Path
from pydantic import BaseModel


class IngestionConfig(BaseModel):
    max_tokens_per_video: int = 500000
    frames_per_batch: int = 10
    frame_interval_seconds: int = 5
    require_confirmation: bool = True


class ChatConfig(BaseModel):
    daily_token_limit: int | None = None
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
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_config.py -v
```

Expected: 2 passed

- [ ] **Step 9: Write data models**

Create `pipeline/src/models.py`:

```python
from pydantic import BaseModel


class Lesson(BaseModel):
    id: str
    filename: str
    date: str
    duration_seconds: float | None = None
    source_type: str  # "coaching" | "youtube" | "other"
    source_url: str | None = None
    source_metadata: dict | None = None
    processing_status: str = "pending"  # "pending" | "processing" | "completed" | "failed"
    topic_summary: str | None = None
    segment_count: int = 0


class TranscriptWord(BaseModel):
    word: str
    start: float
    end: float
    speaker: str | None = None


class Segment(BaseModel):
    lesson_id: str
    segment_index: int
    start_time: float
    end_time: float
    topic: str
    categories: list[str]
    coach_tips: list[str]
    student_observations: list[str]
    visual_context: str
    summary: str
    frames: list[str]
    transcript: str
    speaker_map: dict[str, str] | None = None  # {"SPEAKER_00": "coach", "SPEAKER_01": "danny"}


class Chunk(BaseModel):
    id: str
    lesson_id: str
    segment_index: int
    text: str
    embedding: list[float] | None = None
    start_time: float
    end_time: float
    frames: list[str]


class ProcessingLog(BaseModel):
    lesson_id: str
    stage: str
    tokens_used: int
    timestamp: str
    status: str  # "success" | "error"
    details: str | None = None
```

- [ ] **Step 10: Write test for models**

Add to `pipeline/tests/test_config.py` (or create a `test_models.py`):

```python
def test_lesson_model_defaults():
    from pipeline.src.models import Lesson

    lesson = Lesson(
        id="2025-05-08-lesson-1",
        filename="test.mov",
        date="2025-05-08",
        source_type="coaching",
    )
    assert lesson.processing_status == "pending"
    assert lesson.segment_count == 0
    assert lesson.source_url is None


def test_segment_model():
    from pipeline.src.models import Segment

    segment = Segment(
        lesson_id="2025-05-08-lesson-1",
        segment_index=0,
        start_time=0.0,
        end_time=30.0,
        topic="Driver setup",
        categories=["driver", "setup"],
        coach_tips=["Widen your stance"],
        student_observations=["I feel cramped"],
        visual_context="Toptracer shows narrow stance",
        summary="Coach adjusts stance width for driver",
        frames=["frame_0.0.png"],
        transcript="Coach: Let's widen that stance...",
    )
    assert segment.categories == ["driver", "setup"]
    assert len(segment.coach_tips) == 1
```

- [ ] **Step 11: Run all tests**

```bash
python -m pytest pipeline/tests/ -v
```

Expected: All pass

- [ ] **Step 12: Create conftest with shared fixtures**

Create `pipeline/tests/__init__.py` (empty).

Create `pipeline/tests/conftest.py`:

```python
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
```

- [ ] **Step 13: Commit**

```bash
git add pipeline/ config.json
git commit -m "feat: pipeline project setup with config and data models"
```

---

## Task 2: Pipeline — SQLite Database Layer

**Files:**
- Create: `pipeline/src/db.py`
- Create: `pipeline/tests/test_db.py`

- [ ] **Step 1: Write failing tests for database operations**

Create `pipeline/tests/test_db.py`:

```python
import json
from pipeline.src.db import Database
from pipeline.src.models import Lesson, Segment, Chunk, ProcessingLog


def test_init_creates_tables(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)
    # Should not raise
    db.close()


def test_insert_and_get_lesson(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)

    lesson = Lesson(
        id="lesson-1",
        filename="test.mov",
        date="2025-05-08",
        source_type="coaching",
        duration_seconds=300.0,
    )
    db.insert_lesson(lesson)
    result = db.get_lesson("lesson-1")

    assert result is not None
    assert result.id == "lesson-1"
    assert result.source_type == "coaching"
    assert result.duration_seconds == 300.0
    db.close()


def test_list_lessons(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)

    for i in range(3):
        db.insert_lesson(Lesson(
            id=f"lesson-{i}",
            filename=f"test{i}.mov",
            date="2025-05-08",
            source_type="coaching",
        ))

    lessons = db.list_lessons()
    assert len(lessons) == 3
    db.close()


def test_insert_and_get_segments(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)

    db.insert_lesson(Lesson(
        id="lesson-1", filename="test.mov", date="2025-05-08", source_type="coaching",
    ))

    segment = Segment(
        lesson_id="lesson-1",
        segment_index=0,
        start_time=0.0,
        end_time=30.0,
        topic="Driver setup",
        categories=["driver", "setup"],
        coach_tips=["Widen stance"],
        student_observations=["Feels cramped"],
        visual_context="Narrow stance on Toptracer",
        summary="Stance adjustment",
        frames=["frame_0.png"],
        transcript="Coach: Let's widen that stance...",
    )
    db.insert_segment(segment)
    segments = db.get_segments("lesson-1")

    assert len(segments) == 1
    assert segments[0].topic == "Driver setup"
    assert segments[0].categories == ["driver", "setup"]
    db.close()


def test_update_lesson_status(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)

    db.insert_lesson(Lesson(
        id="lesson-1", filename="test.mov", date="2025-05-08", source_type="coaching",
    ))
    db.update_lesson_status("lesson-1", "completed")
    lesson = db.get_lesson("lesson-1")
    assert lesson.processing_status == "completed"
    db.close()


def test_insert_processing_log(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)

    log = ProcessingLog(
        lesson_id="lesson-1",
        stage="analyze",
        tokens_used=15000,
        timestamp="2025-05-08T12:00:00",
        status="success",
    )
    db.insert_processing_log(log)
    logs = db.get_processing_logs("lesson-1")
    assert len(logs) == 1
    assert logs[0].tokens_used == 15000
    db.close()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest pipeline/tests/test_db.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement database layer**

Create `pipeline/src/db.py`:

```python
import json
import sqlite3
from pathlib import Path
from pipeline.src.models import Lesson, Segment, Chunk, ProcessingLog


class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS lessons (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                date TEXT NOT NULL,
                duration_seconds REAL,
                source_type TEXT NOT NULL,
                source_url TEXT,
                source_metadata TEXT,
                processing_status TEXT DEFAULT 'pending',
                topic_summary TEXT,
                segment_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS segments (
                lesson_id TEXT NOT NULL,
                segment_index INTEGER NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                topic TEXT NOT NULL,
                categories TEXT NOT NULL,
                coach_tips TEXT NOT NULL,
                student_observations TEXT NOT NULL,
                visual_context TEXT NOT NULL,
                summary TEXT NOT NULL,
                frames TEXT NOT NULL,
                transcript TEXT NOT NULL,
                speaker_map TEXT,
                PRIMARY KEY (lesson_id, segment_index),
                FOREIGN KEY (lesson_id) REFERENCES lessons(id)
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                lesson_id TEXT NOT NULL,
                segment_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                embedding BLOB,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                frames TEXT NOT NULL,
                FOREIGN KEY (lesson_id) REFERENCES lessons(id)
            );

            CREATE TABLE IF NOT EXISTS processing_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lesson_id TEXT NOT NULL,
                stage TEXT NOT NULL,
                tokens_used INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL,
                details TEXT
            );
        """)
        self.conn.commit()

    def insert_lesson(self, lesson: Lesson):
        self.conn.execute(
            """INSERT INTO lessons (id, filename, date, duration_seconds, source_type,
               source_url, source_metadata, processing_status, topic_summary, segment_count)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (lesson.id, lesson.filename, lesson.date, lesson.duration_seconds,
             lesson.source_type, lesson.source_url,
             json.dumps(lesson.source_metadata) if lesson.source_metadata else None,
             lesson.processing_status, lesson.topic_summary, lesson.segment_count),
        )
        self.conn.commit()

    def get_lesson(self, lesson_id: str) -> Lesson | None:
        row = self.conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
        if not row:
            return None
        return Lesson(
            id=row["id"], filename=row["filename"], date=row["date"],
            duration_seconds=row["duration_seconds"], source_type=row["source_type"],
            source_url=row["source_url"],
            source_metadata=json.loads(row["source_metadata"]) if row["source_metadata"] else None,
            processing_status=row["processing_status"], topic_summary=row["topic_summary"],
            segment_count=row["segment_count"],
        )

    def list_lessons(self) -> list[Lesson]:
        rows = self.conn.execute("SELECT * FROM lessons ORDER BY date DESC").fetchall()
        return [
            Lesson(
                id=r["id"], filename=r["filename"], date=r["date"],
                duration_seconds=r["duration_seconds"], source_type=r["source_type"],
                source_url=r["source_url"],
                source_metadata=json.loads(r["source_metadata"]) if r["source_metadata"] else None,
                processing_status=r["processing_status"], topic_summary=r["topic_summary"],
                segment_count=r["segment_count"],
            )
            for r in rows
        ]

    def update_lesson_status(self, lesson_id: str, status: str):
        self.conn.execute(
            "UPDATE lessons SET processing_status = ? WHERE id = ?", (status, lesson_id)
        )
        self.conn.commit()

    def insert_segment(self, segment: Segment):
        self.conn.execute(
            """INSERT INTO segments (lesson_id, segment_index, start_time, end_time, topic,
               categories, coach_tips, student_observations, visual_context, summary,
               frames, transcript, speaker_map)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (segment.lesson_id, segment.segment_index, segment.start_time, segment.end_time,
             segment.topic, json.dumps(segment.categories), json.dumps(segment.coach_tips),
             json.dumps(segment.student_observations), segment.visual_context, segment.summary,
             json.dumps(segment.frames), segment.transcript,
             json.dumps(segment.speaker_map) if segment.speaker_map else None),
        )
        self.conn.commit()

    def get_segments(self, lesson_id: str) -> list[Segment]:
        rows = self.conn.execute(
            "SELECT * FROM segments WHERE lesson_id = ? ORDER BY segment_index", (lesson_id,)
        ).fetchall()
        return [
            Segment(
                lesson_id=r["lesson_id"], segment_index=r["segment_index"],
                start_time=r["start_time"], end_time=r["end_time"], topic=r["topic"],
                categories=json.loads(r["categories"]), coach_tips=json.loads(r["coach_tips"]),
                student_observations=json.loads(r["student_observations"]),
                visual_context=r["visual_context"], summary=r["summary"],
                frames=json.loads(r["frames"]), transcript=r["transcript"],
                speaker_map=json.loads(r["speaker_map"]) if r["speaker_map"] else None,
            )
            for r in rows
        ]

    def insert_processing_log(self, log: ProcessingLog):
        self.conn.execute(
            """INSERT INTO processing_log (lesson_id, stage, tokens_used, timestamp, status, details)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (log.lesson_id, log.stage, log.tokens_used, log.timestamp, log.status, log.details),
        )
        self.conn.commit()

    def get_processing_logs(self, lesson_id: str) -> list[ProcessingLog]:
        rows = self.conn.execute(
            "SELECT * FROM processing_log WHERE lesson_id = ? ORDER BY timestamp", (lesson_id,)
        ).fetchall()
        return [
            ProcessingLog(
                lesson_id=r["lesson_id"], stage=r["stage"], tokens_used=r["tokens_used"],
                timestamp=r["timestamp"], status=r["status"], details=r["details"],
            )
            for r in rows
        ]

    def get_total_tokens(self, lesson_id: str | None = None) -> int:
        if lesson_id:
            row = self.conn.execute(
                "SELECT COALESCE(SUM(tokens_used), 0) as total FROM processing_log WHERE lesson_id = ?",
                (lesson_id,),
            ).fetchone()
        else:
            row = self.conn.execute(
                "SELECT COALESCE(SUM(tokens_used), 0) as total FROM processing_log"
            ).fetchone()
        return row["total"]

    def close(self):
        self.conn.close()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_db.py -v
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/db.py pipeline/tests/test_db.py
git commit -m "feat: SQLite database layer with lessons, segments, chunks, processing log"
```

---

## Task 3: Pipeline — Video Acquisition (Local + YouTube)

**Files:**
- Create: `pipeline/src/acquire.py`
- Create: `pipeline/tests/test_acquire.py`

- [ ] **Step 1: Write failing tests**

Create `pipeline/tests/test_acquire.py`:

```python
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from pipeline.src.acquire import acquire_local, acquire_youtube, detect_source_type


def test_detect_source_type_youtube():
    assert detect_source_type("https://www.youtube.com/watch?v=abc123") == "youtube"
    assert detect_source_type("https://youtu.be/abc123") == "youtube"


def test_detect_source_type_local():
    assert detect_source_type("/path/to/video.mov") == "other"
    assert detect_source_type("/path/to/video.mp4") == "other"


def test_acquire_local(tmp_data_dir):
    # Create a fake video file
    video = tmp_data_dir / "test_video.mov"
    video.write_bytes(b"fake video data")

    result = acquire_local(str(video), source_type="coaching")

    assert result["video_path"] == str(video)
    assert result["source_type"] == "coaching"
    assert result["filename"] == "test_video.mov"


def test_acquire_local_file_not_found():
    import pytest
    with pytest.raises(FileNotFoundError):
        acquire_local("/nonexistent/video.mov", source_type="coaching")


@patch("pipeline.src.acquire.subprocess.run")
def test_acquire_youtube(mock_run, tmp_data_dir):
    # Mock yt-dlp metadata extraction
    mock_run.side_effect = [
        # First call: metadata extraction
        MagicMock(
            returncode=0,
            stdout=json.dumps({
                "title": "Perfect Driver Swing",
                "channel": "Golf Tips",
                "description": "Learn the perfect driver swing",
                "duration": 600,
                "id": "abc123",
            }),
        ),
        # Second call: video download
        MagicMock(returncode=0),
    ]

    result = acquire_youtube(
        "https://www.youtube.com/watch?v=abc123",
        download_dir=str(tmp_data_dir / "downloads"),
    )

    assert result["source_type"] == "youtube"
    assert result["source_metadata"]["title"] == "Perfect Driver Swing"
    assert result["source_metadata"]["channel"] == "Golf Tips"
    assert result["lesson_id"] == "youtube-abc123"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest pipeline/tests/test_acquire.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement acquire module**

Create `pipeline/src/acquire.py`:

```python
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

    # Extract metadata first
    result = subprocess.run(
        ["yt-dlp", "--dump-json", "--no-download", url],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp metadata extraction failed: {result.stderr}")

    metadata = json.loads(result.stdout)
    video_id = metadata["id"]
    lesson_id = f"youtube-{video_id}"

    # Download video
    output_template = str(download_path / f"{lesson_id}.%(ext)s")
    dl_result = subprocess.run(
        ["yt-dlp", "-f", "best[ext=mp4]/best", "-o", output_template, url],
        capture_output=True, text=True,
    )
    if dl_result.returncode != 0:
        raise RuntimeError(f"yt-dlp download failed: {dl_result.stderr}")

    # Find downloaded file
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_acquire.py -v
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/acquire.py pipeline/tests/test_acquire.py
git commit -m "feat: video acquisition — local files and YouTube via yt-dlp"
```

---

## Task 4: Pipeline — Audio Extraction

**Files:**
- Create: `pipeline/src/audio.py`
- Create: `pipeline/tests/test_audio.py`

- [ ] **Step 1: Write failing test**

Create `pipeline/tests/test_audio.py`:

```python
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
    assert "-vn" in cmd  # no video


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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest pipeline/tests/test_audio.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement audio extraction**

Create `pipeline/src/audio.py`:

```python
import subprocess
from pathlib import Path


def extract_audio(video_path: str, output_dir: str, lesson_id: str) -> str:
    output_path = Path(output_dir) / f"{lesson_id}.wav"
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "ffmpeg", "-i", video_path,
            "-vn",              # no video
            "-acodec", "pcm_s16le",  # 16-bit PCM
            "-ar", "16000",     # 16kHz sample rate (optimal for Whisper)
            "-ac", "1",         # mono
            "-y",               # overwrite
            str(output_path),
        ],
        capture_output=True, text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extraction failed: {result.stderr}")

    return str(output_path)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_audio.py -v
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/audio.py pipeline/tests/test_audio.py
git commit -m "feat: audio extraction from video via ffmpeg"
```

---

## Task 5: Pipeline — Transcription + Speaker Diarization

**Files:**
- Create: `pipeline/src/transcribe.py`
- Create: `pipeline/tests/test_transcribe.py`

Note: `whisperx` requires PyTorch and optionally a HuggingFace token for speaker diarization (pyannote). Install separately:
```bash
pip install whisperx torch
```

- [ ] **Step 1: Write failing tests**

Create `pipeline/tests/test_transcribe.py`:

```python
import json
from unittest.mock import patch, MagicMock
from pipeline.src.transcribe import transcribe_audio, format_transcript


def test_format_transcript():
    raw_segments = [
        {"text": " Hello, let's work on your driver.", "start": 0.0, "end": 3.5, "speaker": "SPEAKER_00"},
        {"text": " Yeah, I've been slicing it a lot.", "start": 3.5, "end": 6.0, "speaker": "SPEAKER_01"},
    ]
    speaker_map = {"SPEAKER_00": "coach", "SPEAKER_01": "danny"}

    result = format_transcript(raw_segments, speaker_map)

    assert len(result) == 2
    assert result[0]["speaker"] == "coach"
    assert result[0]["text"] == "Hello, let's work on your driver."
    assert result[1]["speaker"] == "danny"


def test_format_transcript_no_speaker_map():
    raw_segments = [
        {"text": " This is a tip about driving.", "start": 0.0, "end": 3.0, "speaker": "SPEAKER_00"},
    ]

    result = format_transcript(raw_segments, speaker_map=None)

    assert result[0]["speaker"] == "SPEAKER_00"


@patch("pipeline.src.transcribe.whisperx")
def test_transcribe_audio_coaching(mock_wx, tmp_data_dir):
    # Mock whisperx model and results
    mock_model = MagicMock()
    mock_wx.load_model.return_value = mock_model
    mock_model.transcribe.return_value = {
        "segments": [
            {"text": " Hello", "start": 0.0, "end": 1.0, "words": []},
        ],
        "language": "en",
    }
    mock_wx.load_align_model.return_value = (MagicMock(), MagicMock())
    mock_wx.align.return_value = {
        "segments": [
            {"text": " Hello", "start": 0.0, "end": 1.0, "words": [], "speaker": "SPEAKER_00"},
        ],
    }
    mock_wx.DiarizationPipeline.return_value = MagicMock()
    mock_wx.assign_word_speakers.return_value = {
        "segments": [
            {"text": " Hello", "start": 0.0, "end": 1.0, "words": [], "speaker": "SPEAKER_00"},
        ],
    }

    audio_path = str(tmp_data_dir / "audio" / "test.wav")
    output_dir = str(tmp_data_dir / "transcripts")

    result = transcribe_audio(
        audio_path, output_dir, lesson_id="lesson-1",
        source_type="coaching", speaker_map={"SPEAKER_00": "coach"},
    )

    assert result["lesson_id"] == "lesson-1"
    assert len(result["segments"]) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest pipeline/tests/test_transcribe.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement transcription module**

Create `pipeline/src/transcribe.py`:

```python
import json
from pathlib import Path


def format_transcript(raw_segments: list[dict], speaker_map: dict | None = None) -> list[dict]:
    formatted = []
    for seg in raw_segments:
        speaker = seg.get("speaker", "unknown")
        if speaker_map and speaker in speaker_map:
            speaker = speaker_map[speaker]

        formatted.append({
            "text": seg["text"].strip(),
            "start": seg["start"],
            "end": seg["end"],
            "speaker": speaker,
        })
    return formatted


def transcribe_audio(
    audio_path: str,
    output_dir: str,
    lesson_id: str,
    source_type: str = "other",
    speaker_map: dict | None = None,
    model_size: str = "base",
    hf_token: str | None = None,
) -> dict:
    import whisperx

    device = "cpu"
    compute_type = "int8"

    # Load model and transcribe
    model = whisperx.load_model(model_size, device, compute_type=compute_type)
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio)

    # Align whisper output for word-level timestamps
    align_model, align_metadata = whisperx.load_align_model(
        language_code=result.get("language", "en"), device=device,
    )
    result = whisperx.align(
        result["segments"], align_model, align_metadata, audio, device,
    )

    # Speaker diarization for coaching videos
    if source_type == "coaching" and hf_token:
        diarize_model = whisperx.DiarizationPipeline(use_auth_token=hf_token, device=device)
        diarize_segments = diarize_model(audio_path)
        result = whisperx.assign_word_speakers(diarize_segments, result)

    # Format transcript
    segments = format_transcript(result["segments"], speaker_map)

    transcript_data = {
        "lesson_id": lesson_id,
        "source_type": source_type,
        "segments": segments,
        "speaker_map": speaker_map,
    }

    # Save to file
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    transcript_file = output_path / f"{lesson_id}.json"
    with open(transcript_file, "w") as f:
        json.dump(transcript_data, f, indent=2)

    return transcript_data
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_transcribe.py -v
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/transcribe.py pipeline/tests/test_transcribe.py
git commit -m "feat: audio transcription with whisperx and speaker diarization"
```

---

## Task 6: Pipeline — Keyframe Extraction

**Files:**
- Create: `pipeline/src/frames.py`
- Create: `pipeline/tests/test_frames.py`

- [ ] **Step 1: Write failing tests**

Create `pipeline/tests/test_frames.py`:

```python
from unittest.mock import patch, MagicMock, call
from pipeline.src.frames import extract_keyframes, build_ffmpeg_command


def test_build_ffmpeg_command_interval():
    cmd = build_ffmpeg_command(
        video_path="/video.mov",
        output_dir="/frames/lesson-1",
        interval_seconds=5,
    )
    assert cmd[0] == "ffmpeg"
    assert "-i" in cmd
    assert "/video.mov" in cmd


@patch("pipeline.src.frames.subprocess.run")
@patch("pipeline.src.frames.get_video_duration")
def test_extract_keyframes(mock_duration, mock_run, tmp_data_dir):
    mock_duration.return_value = 30.0
    mock_run.return_value = MagicMock(returncode=0)

    frames_dir = str(tmp_data_dir / "frames" / "lesson-1")
    # Create fake frame files that ffmpeg would produce
    import os
    os.makedirs(frames_dir, exist_ok=True)
    for t in ["00_00_00", "00_00_05", "00_00_10", "00_00_15", "00_00_20", "00_00_25"]:
        (tmp_data_dir / "frames" / "lesson-1" / f"frame_{t}.png").write_bytes(b"fake")

    result = extract_keyframes(
        video_path="/fake/video.mov",
        output_dir=str(tmp_data_dir / "frames"),
        lesson_id="lesson-1",
        interval_seconds=5,
    )

    assert result["lesson_id"] == "lesson-1"
    assert result["frames_dir"] == frames_dir
    assert len(result["frame_files"]) == 6


@patch("pipeline.src.frames.subprocess.run")
@patch("pipeline.src.frames.get_video_duration")
def test_extract_keyframes_failure(mock_duration, mock_run, tmp_data_dir):
    mock_duration.return_value = 30.0
    mock_run.return_value = MagicMock(returncode=1, stderr="error")
    import pytest

    with pytest.raises(RuntimeError):
        extract_keyframes(
            video_path="/fake/video.mov",
            output_dir=str(tmp_data_dir / "frames"),
            lesson_id="lesson-1",
        )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest pipeline/tests/test_frames.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement keyframe extraction**

Create `pipeline/src/frames.py`:

```python
import subprocess
from pathlib import Path


def get_video_duration(video_path: str) -> float:
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


def build_ffmpeg_command(video_path: str, output_dir: str, interval_seconds: int = 5) -> list[str]:
    return [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps=1/{interval_seconds}",
        "-frame_pts", "1",
        "-y",
        f"{output_dir}/frame_%02d_%02d_%02d.png",  # HH_MM_SS pattern
    ]


def extract_keyframes(
    video_path: str,
    output_dir: str,
    lesson_id: str,
    interval_seconds: int = 5,
) -> dict:
    frames_dir = str(Path(output_dir) / lesson_id)
    Path(frames_dir).mkdir(parents=True, exist_ok=True)

    # Extract at regular intervals using fps filter
    # Using select filter for timestamp-based naming
    result = subprocess.run(
        [
            "ffmpeg", "-i", video_path,
            "-vf", (
                f"select='not(mod(t\\,{interval_seconds}))',"
                "scale=1280:-1"  # cap width at 1280px to save space
            ),
            "-vsync", "vfr",
            "-frame_pts", "1",
            "-y",
            f"{frames_dir}/frame_%02d_%02d_%02d.png",
        ],
        capture_output=True, text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg keyframe extraction failed: {result.stderr}")

    # Collect output frame files
    frame_files = sorted(Path(frames_dir).glob("frame_*.png"))

    return {
        "lesson_id": lesson_id,
        "frames_dir": frames_dir,
        "frame_files": [f.name for f in frame_files],
        "frame_count": len(frame_files),
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_frames.py -v
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/frames.py pipeline/tests/test_frames.py
git commit -m "feat: keyframe extraction from video via ffmpeg"
```

---

## Task 7: Pipeline — Cost Tracking

**Files:**
- Create: `pipeline/src/cost.py`
- Create: `pipeline/tests/test_cost.py`

- [ ] **Step 1: Write failing tests**

Create `pipeline/tests/test_cost.py`:

```python
from pipeline.src.cost import CostTracker, estimate_tokens


def test_estimate_tokens():
    # ~4 chars per token for English text
    text = "a" * 4000  # ~1000 tokens
    frames_count = 5
    estimate = estimate_tokens(text, frames_count)
    assert estimate > 0
    assert estimate > 1000  # text tokens + frame tokens


def test_cost_tracker_within_budget():
    tracker = CostTracker(max_tokens_per_video=100000)
    tracker.add(5000)
    tracker.add(10000)
    assert tracker.total == 15000
    assert tracker.is_within_budget()


def test_cost_tracker_exceeds_budget():
    tracker = CostTracker(max_tokens_per_video=10000)
    tracker.add(8000)
    tracker.add(5000)
    assert tracker.total == 13000
    assert not tracker.is_within_budget()


def test_cost_tracker_no_budget():
    tracker = CostTracker(max_tokens_per_video=None)
    tracker.add(999999)
    assert tracker.is_within_budget()


def test_dry_run_estimate():
    transcript_text = "word " * 500  # ~500 words
    frame_count = 60  # 5 min video at 5sec intervals
    estimate = estimate_tokens(transcript_text, frame_count)
    assert isinstance(estimate, int)
    assert estimate > 0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest pipeline/tests/test_cost.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement cost tracking**

Create `pipeline/src/cost.py`:

```python
# Average tokens per image for Claude vision: ~1600 tokens per image (varies by size)
TOKENS_PER_IMAGE = 1600
CHARS_PER_TOKEN = 4


def estimate_tokens(text: str, frame_count: int) -> int:
    text_tokens = len(text) // CHARS_PER_TOKEN
    image_tokens = frame_count * TOKENS_PER_IMAGE
    # Add ~20% overhead for system prompt + structured output
    overhead = int((text_tokens + image_tokens) * 0.2)
    return text_tokens + image_tokens + overhead


class CostTracker:
    def __init__(self, max_tokens_per_video: int | None = 500000):
        self.max_tokens_per_video = max_tokens_per_video
        self.total = 0
        self.entries: list[dict] = []

    def add(self, tokens: int, stage: str = "", details: str = ""):
        self.total += tokens
        self.entries.append({
            "tokens": tokens,
            "stage": stage,
            "details": details,
            "running_total": self.total,
        })

    def is_within_budget(self) -> bool:
        if self.max_tokens_per_video is None:
            return True
        return self.total <= self.max_tokens_per_video

    def remaining(self) -> int | None:
        if self.max_tokens_per_video is None:
            return None
        return max(0, self.max_tokens_per_video - self.total)

    def summary(self) -> str:
        budget_str = f"/ {self.max_tokens_per_video:,}" if self.max_tokens_per_video else "(no limit)"
        return f"Tokens used: {self.total:,} {budget_str}"
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_cost.py -v
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/cost.py pipeline/tests/test_cost.py
git commit -m "feat: cost tracking with token estimation and budget enforcement"
```

---

## Task 8: Pipeline — Multimodal Analysis with Claude

**Files:**
- Create: `pipeline/src/analyze.py`
- Create: `pipeline/tests/test_analyze.py`

- [ ] **Step 1: Write failing tests**

Create `pipeline/tests/test_analyze.py`:

```python
import json
import base64
from unittest.mock import patch, MagicMock
from pipeline.src.analyze import analyze_batch, build_analysis_prompt, parse_analysis_response
from pipeline.src.cost import CostTracker


def test_build_analysis_prompt_coaching():
    prompt = build_analysis_prompt(
        transcript_chunk="Coach: Let's work on your takeaway.\nDanny: OK, what should I focus on?",
        source_type="coaching",
        start_time=60.0,
        end_time=90.0,
    )
    assert "coaching session" in prompt.lower()
    assert "takeaway" in prompt


def test_build_analysis_prompt_youtube():
    prompt = build_analysis_prompt(
        transcript_chunk="Today we're going to talk about lag in the downswing.",
        source_type="youtube",
        start_time=0.0,
        end_time=30.0,
        source_metadata={"title": "Lag Secrets", "channel": "Golf Tips"},
    )
    assert "youtube" in prompt.lower() or "video" in prompt.lower()


def test_parse_analysis_response():
    raw = json.dumps({
        "topic": "Driver takeaway",
        "categories": ["driver", "takeaway"],
        "coach_tips": ["Keep clubhead outside hands"],
        "student_observations": ["I pull it inside"],
        "visual_context": "Toptracer shows out-to-in path",
        "summary": "Working on takeaway path for driver",
    })

    result = parse_analysis_response(raw)
    assert result["topic"] == "Driver takeaway"
    assert len(result["categories"]) == 2


def test_parse_analysis_response_with_markdown():
    raw = '```json\n{"topic": "Grip", "categories": ["grip"], "coach_tips": ["Stronger grip"], "student_observations": [], "visual_context": "", "summary": "Grip adjustment"}\n```'

    result = parse_analysis_response(raw)
    assert result["topic"] == "Grip"


@patch("pipeline.src.analyze.anthropic.Anthropic")
def test_analyze_batch(mock_anthropic_class, tmp_data_dir):
    mock_client = MagicMock()
    mock_anthropic_class.return_value = mock_client

    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=json.dumps({
        "topic": "Driver setup",
        "categories": ["driver", "setup"],
        "coach_tips": ["Widen stance"],
        "student_observations": ["Feels narrow"],
        "visual_context": "Stance shown on screen",
        "summary": "Adjusting driver stance",
    }))]
    mock_response.usage.input_tokens = 5000
    mock_response.usage.output_tokens = 500
    mock_client.messages.create.return_value = mock_response

    # Create a fake frame
    frame_path = tmp_data_dir / "frames" / "lesson-1"
    frame_path.mkdir(parents=True)
    (frame_path / "frame_00.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

    tracker = CostTracker(max_tokens_per_video=100000)

    result = analyze_batch(
        transcript_chunk="Coach: Widen your stance.\nDanny: Like this?",
        frame_paths=[str(frame_path / "frame_00.png")],
        source_type="coaching",
        start_time=0.0,
        end_time=30.0,
        cost_tracker=tracker,
    )

    assert result["topic"] == "Driver setup"
    assert tracker.total == 5500  # input + output
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest pipeline/tests/test_analyze.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement multimodal analysis**

Create `pipeline/src/analyze.py`:

```python
import base64
import json
import re
from pathlib import Path
import anthropic
from pipeline.src.cost import CostTracker


def build_analysis_prompt(
    transcript_chunk: str,
    source_type: str,
    start_time: float,
    end_time: float,
    source_metadata: dict | None = None,
) -> str:
    context = ""
    if source_type == "coaching":
        context = (
            "This is a transcript from a personal golf coaching session between a coach and Danny (the student). "
            "The video shows Toptracer data overlaid with the coaching conversation."
        )
    elif source_type == "youtube":
        title = source_metadata.get("title", "Unknown") if source_metadata else "Unknown"
        channel = source_metadata.get("channel", "Unknown") if source_metadata else "Unknown"
        context = (
            f"This is a transcript from a YouTube golf instruction video: \"{title}\" by {channel}. "
            "The video likely shows the instructor demonstrating techniques."
        )
    else:
        context = "This is a transcript from a golf instruction video."

    return f"""{context}

Analyze this segment ({start_time:.1f}s - {end_time:.1f}s) of the video.

TRANSCRIPT:
{transcript_chunk}

INSTRUCTIONS:
Look at both the transcript and the accompanying video frames. Extract structured information about what is being taught.

Respond with a JSON object (no markdown fencing) with these fields:
- "topic": The main topic discussed (e.g., "Driver takeaway path")
- "categories": Array of relevant tags (club type, skill area, drill name, etc.)
- "coach_tips": Array of specific, actionable coaching advice given
- "student_observations": Array of questions, feelings, or observations from the student (empty array if YouTube/single-speaker)
- "visual_context": What the video frames show and how it relates to the verbal coaching
- "summary": 1-2 sentence summary of this segment"""


def parse_analysis_response(raw_text: str) -> dict:
    # Strip markdown code fences if present
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def analyze_batch(
    transcript_chunk: str,
    frame_paths: list[str],
    source_type: str,
    start_time: float,
    end_time: float,
    cost_tracker: CostTracker,
    source_metadata: dict | None = None,
    model: str = "claude-sonnet-4.6",
) -> dict:
    client = anthropic.Anthropic()

    prompt = build_analysis_prompt(
        transcript_chunk, source_type, start_time, end_time, source_metadata,
    )

    # Build message content with frames as images
    content: list[dict] = []
    for frame_path in frame_paths:
        with open(frame_path, "rb") as f:
            image_data = base64.standard_b64encode(f.read()).decode("utf-8")
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": image_data},
        })
    content.append({"type": "text", "text": prompt})

    response = client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": content}],
    )

    tokens_used = response.usage.input_tokens + response.usage.output_tokens
    cost_tracker.add(tokens_used, stage="analyze", details=f"{start_time:.1f}s-{end_time:.1f}s")

    return parse_analysis_response(response.content[0].text)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_analyze.py -v
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/analyze.py pipeline/tests/test_analyze.py
git commit -m "feat: multimodal analysis of video segments with Claude"
```

---

## Task 9: Pipeline — Chunking + Embedding

**Files:**
- Create: `pipeline/src/embed.py`
- Create: `pipeline/tests/test_embed.py`

- [ ] **Step 1: Write failing tests**

Create `pipeline/tests/test_embed.py`:

```python
from pipeline.src.embed import chunk_segments, generate_embeddings
from pipeline.src.models import Segment


def test_chunk_segments_short_segment():
    """A short segment should produce a single chunk."""
    segment = Segment(
        lesson_id="lesson-1", segment_index=0,
        start_time=0.0, end_time=30.0,
        topic="Grip", categories=["grip"],
        coach_tips=["Stronger left hand"],
        student_observations=["Feels weird"],
        visual_context="Grip shown on screen",
        summary="Adjusting grip strength",
        frames=["frame_00.png"],
        transcript="Coach: Let's strengthen that left hand grip. Danny: Like this? Coach: Yes, rotate it clockwise about 15 degrees.",
    )

    chunks = chunk_segments([segment])
    assert len(chunks) >= 1
    assert chunks[0].lesson_id == "lesson-1"
    assert chunks[0].segment_index == 0
    assert "grip" in chunks[0].text.lower()


def test_chunk_segments_includes_context():
    """Chunks should include topic and tips for better retrieval."""
    segment = Segment(
        lesson_id="lesson-1", segment_index=0,
        start_time=0.0, end_time=30.0,
        topic="Driver Takeaway",
        categories=["driver", "takeaway"],
        coach_tips=["Keep clubhead outside hands"],
        student_observations=[],
        visual_context="Club path data shown",
        summary="Working on takeaway path",
        frames=["frame_00.png"],
        transcript="Short transcript here.",
    )

    chunks = chunk_segments([segment])
    assert "Driver Takeaway" in chunks[0].text
    assert "Keep clubhead outside hands" in chunks[0].text


def test_generate_embeddings():
    texts = ["golf swing tips", "driver takeaway path"]
    embeddings = generate_embeddings(texts)
    assert len(embeddings) == 2
    assert len(embeddings[0]) > 0  # non-empty vector
    assert isinstance(embeddings[0][0], float)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest pipeline/tests/test_embed.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement chunking and embedding**

Create `pipeline/src/embed.py`:

```python
import uuid
from sentence_transformers import SentenceTransformer
from pipeline.src.models import Segment, Chunk

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
MAX_CHUNK_CHARS = 2000  # ~500 tokens

_model = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def chunk_segments(segments: list[Segment]) -> list[Chunk]:
    chunks = []
    for segment in segments:
        # Build enriched text that includes metadata for better retrieval
        enriched = f"Topic: {segment.topic}\n"
        if segment.categories:
            enriched += f"Categories: {', '.join(segment.categories)}\n"
        if segment.coach_tips:
            enriched += f"Coach tips: {'; '.join(segment.coach_tips)}\n"
        if segment.student_observations:
            enriched += f"Student observations: {'; '.join(segment.student_observations)}\n"
        if segment.visual_context:
            enriched += f"Visual context: {segment.visual_context}\n"
        enriched += f"Summary: {segment.summary}\n\n"
        enriched += f"Transcript:\n{segment.transcript}"

        # Split into chunks if too long
        if len(enriched) <= MAX_CHUNK_CHARS:
            chunks.append(Chunk(
                id=str(uuid.uuid4()),
                lesson_id=segment.lesson_id,
                segment_index=segment.segment_index,
                text=enriched,
                start_time=segment.start_time,
                end_time=segment.end_time,
                frames=segment.frames,
            ))
        else:
            # Split transcript into roughly equal parts
            lines = segment.transcript.split(". ")
            header = enriched[:enriched.index("Transcript:\n") + len("Transcript:\n")]
            current_text = header
            chunk_start = segment.start_time
            time_per_char = (segment.end_time - segment.start_time) / max(len(segment.transcript), 1)

            for line in lines:
                if len(current_text) + len(line) > MAX_CHUNK_CHARS and len(current_text) > len(header):
                    chars_so_far = len(current_text) - len(header)
                    chunk_end = chunk_start + chars_so_far * time_per_char
                    chunks.append(Chunk(
                        id=str(uuid.uuid4()),
                        lesson_id=segment.lesson_id,
                        segment_index=segment.segment_index,
                        text=current_text,
                        start_time=chunk_start,
                        end_time=chunk_end,
                        frames=segment.frames,
                    ))
                    chunk_start = chunk_end
                    current_text = header
                current_text += line + ". "

            if current_text.strip() and current_text != header:
                chunks.append(Chunk(
                    id=str(uuid.uuid4()),
                    lesson_id=segment.lesson_id,
                    segment_index=segment.segment_index,
                    text=current_text,
                    start_time=chunk_start,
                    end_time=segment.end_time,
                    frames=segment.frames,
                ))

    return chunks


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    embeddings = model.encode(texts, convert_to_numpy=True)
    return [emb.tolist() for emb in embeddings]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_embed.py -v
```

Expected: All pass (first run will download the embedding model, ~90MB)

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/embed.py pipeline/tests/test_embed.py
git commit -m "feat: segment chunking and local embedding generation"
```

---

## Task 10: Pipeline — CLI Entry Point

**Files:**
- Create: `pipeline/ingest.py`
- Create: `pipeline/tests/test_ingest.py`

- [ ] **Step 1: Write failing test for the orchestrator**

Create `pipeline/tests/test_ingest.py`:

```python
from unittest.mock import patch, MagicMock
from pipeline.ingest import process_video


@patch("pipeline.ingest.store_chunks")
@patch("pipeline.ingest.generate_embeddings")
@patch("pipeline.ingest.chunk_segments")
@patch("pipeline.ingest.analyze_all_segments")
@patch("pipeline.ingest.extract_keyframes")
@patch("pipeline.ingest.transcribe_audio")
@patch("pipeline.ingest.extract_audio")
@patch("pipeline.ingest.acquire_local")
def test_process_video_local(
    mock_acquire, mock_audio, mock_transcribe, mock_frames,
    mock_analyze, mock_chunk, mock_embed, mock_store, tmp_path, sample_config,
):
    mock_acquire.return_value = {
        "video_path": "/fake/video.mov",
        "filename": "video.mov",
        "source_type": "coaching",
        "source_url": None,
        "source_metadata": None,
        "lesson_id": "lesson-1",
    }
    mock_audio.return_value = "/fake/audio.wav"
    mock_transcribe.return_value = {
        "lesson_id": "lesson-1",
        "segments": [{"text": "Hello", "start": 0.0, "end": 1.0, "speaker": "coach"}],
    }
    mock_frames.return_value = {
        "lesson_id": "lesson-1",
        "frames_dir": "/fake/frames",
        "frame_files": ["frame_00.png"],
        "frame_count": 1,
    }
    mock_analyze.return_value = [MagicMock()]
    mock_chunk.return_value = [MagicMock(text="chunk text", id="c1")]
    mock_embed.return_value = [[0.1, 0.2, 0.3]]

    result = process_video(
        source="/fake/video.mov",
        source_type="coaching",
        config_path=sample_config,
        dry_run=False,
        confirm_fn=lambda _: True,
    )

    assert result["lesson_id"] == "lesson-1"
    assert result["status"] == "completed"
    mock_acquire.assert_called_once()
    mock_audio.assert_called_once()
    mock_transcribe.assert_called_once()


def test_process_video_dry_run(tmp_path, sample_config):
    # Dry run should estimate and return without processing
    # We'd need real ffprobe for duration, so mock it
    with patch("pipeline.ingest.acquire_local") as mock_acquire, \
         patch("pipeline.ingest.get_video_duration") as mock_dur:
        mock_acquire.return_value = {
            "video_path": "/fake/video.mov",
            "filename": "video.mov",
            "source_type": "coaching",
            "source_url": None,
            "source_metadata": None,
            "lesson_id": "lesson-1",
        }
        mock_dur.return_value = 300.0

        result = process_video(
            source="/fake/video.mov",
            source_type="coaching",
            config_path=sample_config,
            dry_run=True,
        )

        assert result["status"] == "dry_run"
        assert "estimated_tokens" in result
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest pipeline/tests/test_ingest.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement CLI entry point**

Create `pipeline/ingest.py`:

```python
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable

from pipeline.src.config import load_config
from pipeline.src.db import Database
from pipeline.src.models import Lesson, Segment, Chunk, ProcessingLog
from pipeline.src.acquire import acquire_local, acquire_youtube, detect_source_type
from pipeline.src.audio import extract_audio
from pipeline.src.transcribe import transcribe_audio
from pipeline.src.frames import extract_keyframes, get_video_duration
from pipeline.src.analyze import analyze_batch
from pipeline.src.embed import chunk_segments, generate_embeddings
from pipeline.src.cost import CostTracker, estimate_tokens


def analyze_all_segments(
    transcript_segments: list[dict],
    frames_result: dict,
    source_type: str,
    cost_tracker: CostTracker,
    config,
    source_metadata: dict | None = None,
) -> list[Segment]:
    """Process transcript in time-based batches with corresponding frames."""
    segments = []
    batch_duration = 45  # seconds per batch

    # Group transcript segments into time batches
    if not transcript_segments:
        return segments

    batch_start = transcript_segments[0]["start"]
    batch_texts = []
    batch_idx = 0

    for seg in transcript_segments:
        batch_texts.append(f"{seg.get('speaker', 'unknown')}: {seg['text']}")

        # Check if batch is full
        if seg["end"] - batch_start >= batch_duration or seg == transcript_segments[-1]:
            batch_end = seg["end"]
            transcript_chunk = "\n".join(batch_texts)

            # Find frames in this time range
            frame_files = []
            frames_dir = frames_result["frames_dir"]
            for f in frames_result.get("frame_files", []):
                frame_files.append(str(Path(frames_dir) / f))

            # Limit frames per batch
            batch_frames = frame_files[:config.ingestion.frames_per_batch]

            if not cost_tracker.is_within_budget():
                print(f"  Budget exceeded at segment {batch_idx}. Stopping analysis.")
                break

            try:
                result = analyze_batch(
                    transcript_chunk=transcript_chunk,
                    frame_paths=batch_frames,
                    source_type=source_type,
                    start_time=batch_start,
                    end_time=batch_end,
                    cost_tracker=cost_tracker,
                    source_metadata=source_metadata,
                )

                segment = Segment(
                    lesson_id=frames_result["lesson_id"],
                    segment_index=batch_idx,
                    start_time=batch_start,
                    end_time=batch_end,
                    topic=result["topic"],
                    categories=result["categories"],
                    coach_tips=result["coach_tips"],
                    student_observations=result["student_observations"],
                    visual_context=result["visual_context"],
                    summary=result["summary"],
                    frames=[Path(f).name for f in batch_frames],
                    transcript=transcript_chunk,
                )
                segments.append(segment)
                print(f"  Segment {batch_idx}: {result['topic']} ({cost_tracker.summary()})")

            except Exception as e:
                print(f"  Error analyzing segment {batch_idx}: {e}")

            batch_idx += 1
            batch_start = seg["end"]
            batch_texts = []

    return segments


def store_chunks(chunks: list[Chunk], embeddings: list[list[float]], db: Database):
    for chunk, embedding in zip(chunks, embeddings):
        chunk.embedding = embedding
        db.conn.execute(
            """INSERT INTO chunks (id, lesson_id, segment_index, text, embedding,
               start_time, end_time, frames) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (chunk.id, chunk.lesson_id, chunk.segment_index, chunk.text,
             json.dumps(embedding), chunk.start_time, chunk.end_time,
             json.dumps(chunk.frames)),
        )
    db.conn.commit()


def process_video(
    source: str,
    source_type: str | None = None,
    config_path: str = "config.json",
    dry_run: bool = False,
    confirm_fn: Callable | None = None,
    speaker_map: dict | None = None,
    hf_token: str | None = None,
) -> dict:
    config = load_config(config_path)

    # Stage 0: Acquire video
    detected_type = source_type or detect_source_type(source)
    if detected_type == "youtube":
        acquisition = acquire_youtube(source, download_dir=str(Path(config.paths.data_dir) / "downloads"))
    else:
        acquisition = acquire_local(source, source_type=detected_type)

    lesson_id = acquisition["lesson_id"]
    video_path = acquisition["video_path"]

    # Dry run: estimate tokens and return
    if dry_run:
        duration = get_video_duration(video_path)
        # Rough estimate: ~100 words/min speech, ~250 chars/min, 5sec frame interval
        est_text_chars = int(duration / 60 * 250)
        est_frames = int(duration / config.ingestion.frame_interval_seconds)
        est_tokens = estimate_tokens("x" * est_text_chars, est_frames)

        return {
            "lesson_id": lesson_id,
            "status": "dry_run",
            "estimated_tokens": est_tokens,
            "estimated_frames": est_frames,
            "duration_seconds": duration,
            "budget": config.ingestion.max_tokens_per_video,
        }

    # Confirm if required
    if config.ingestion.require_confirmation and confirm_fn:
        if not confirm_fn(f"Process {acquisition['filename']}?"):
            return {"lesson_id": lesson_id, "status": "cancelled"}

    # Initialize DB and cost tracker
    db = Database(config.paths.db_path)
    cost_tracker = CostTracker(max_tokens_per_video=config.ingestion.max_tokens_per_video)

    try:
        # Create lesson record
        lesson = Lesson(
            id=lesson_id,
            filename=acquisition["filename"],
            date=datetime.now().strftime("%Y-%m-%d"),
            source_type=acquisition["source_type"],
            source_url=acquisition.get("source_url"),
            source_metadata=acquisition.get("source_metadata"),
            processing_status="processing",
        )
        db.insert_lesson(lesson)

        # Stage 1: Extract audio
        print(f"[1/5] Extracting audio from {acquisition['filename']}...")
        audio_path = extract_audio(
            video_path, str(Path(config.paths.data_dir) / "audio"), lesson_id,
        )

        # Stage 2: Transcribe
        print("[2/5] Transcribing audio...")
        transcript = transcribe_audio(
            audio_path,
            str(Path(config.paths.data_dir) / "transcripts"),
            lesson_id,
            source_type=acquisition["source_type"],
            speaker_map=speaker_map,
            hf_token=hf_token,
        )

        # Stage 3: Extract keyframes
        print("[3/5] Extracting keyframes...")
        frames_result = extract_keyframes(
            video_path,
            str(Path(config.paths.data_dir) / "frames"),
            lesson_id,
            interval_seconds=config.ingestion.frame_interval_seconds,
        )
        frames_result["lesson_id"] = lesson_id

        # Stage 4: Multimodal analysis
        print("[4/5] Analyzing segments with Claude...")
        segments = analyze_all_segments(
            transcript["segments"], frames_result,
            acquisition["source_type"], cost_tracker, config,
            source_metadata=acquisition.get("source_metadata"),
        )
        for segment in segments:
            db.insert_segment(segment)

        # Stage 5: Chunk and embed
        print("[5/5] Generating embeddings...")
        chunks = chunk_segments(segments)
        if chunks:
            embeddings = generate_embeddings([c.text for c in chunks])
            store_chunks(chunks, embeddings, db)

        # Update lesson status
        db.update_lesson_status(lesson_id, "completed")
        db.conn.execute(
            "UPDATE lessons SET segment_count = ?, duration_seconds = ? WHERE id = ?",
            (len(segments), get_video_duration(video_path) if Path(video_path).exists() else None, lesson_id),
        )
        db.conn.commit()

        # Log processing
        db.insert_processing_log(ProcessingLog(
            lesson_id=lesson_id, stage="complete",
            tokens_used=cost_tracker.total,
            timestamp=datetime.now().isoformat(),
            status="success",
            details=f"{len(segments)} segments, {len(chunks)} chunks",
        ))

        print(f"\nDone! {len(segments)} segments, {len(chunks)} chunks. {cost_tracker.summary()}")

        return {
            "lesson_id": lesson_id,
            "status": "completed",
            "segments": len(segments),
            "chunks": len(chunks),
            "tokens_used": cost_tracker.total,
        }

    except Exception as e:
        db.update_lesson_status(lesson_id, "failed")
        db.insert_processing_log(ProcessingLog(
            lesson_id=lesson_id, stage="error",
            tokens_used=cost_tracker.total,
            timestamp=datetime.now().isoformat(),
            status="error", details=str(e),
        ))
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Golf Coach Knowledge Base — Video Ingestion")
    parser.add_argument("source", help="Video file path or YouTube URL")
    parser.add_argument("--type", choices=["coaching", "youtube", "other"], help="Source type override")
    parser.add_argument("--dry-run", action="store_true", help="Estimate tokens without processing")
    parser.add_argument("--config", default="config.json", help="Config file path")
    parser.add_argument("--speaker-map", type=json.loads, help='Speaker map JSON, e.g. \'{"SPEAKER_00": "coach"}\'')
    parser.add_argument("--hf-token", help="HuggingFace token for speaker diarization")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")

    args = parser.parse_args()

    confirm_fn = None if args.yes else lambda msg: input(f"{msg} [y/N] ").lower() == "y"

    result = process_video(
        source=args.source,
        source_type=args.type,
        config_path=args.config,
        dry_run=args.dry_run,
        confirm_fn=confirm_fn,
        speaker_map=args.speaker_map,
        hf_token=args.hf_token,
    )

    if result["status"] == "dry_run":
        print(f"\nDry run estimate for {result['lesson_id']}:")
        print(f"  Duration: {result['duration_seconds']:.0f}s")
        print(f"  Estimated frames: {result['estimated_frames']}")
        print(f"  Estimated tokens: {result['estimated_tokens']:,}")
        print(f"  Budget: {result['budget']:,}")
        within = "WITHIN" if result['estimated_tokens'] <= result['budget'] else "EXCEEDS"
        print(f"  Status: {within} budget")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest pipeline/tests/test_ingest.py -v
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add pipeline/ingest.py pipeline/tests/test_ingest.py
git commit -m "feat: CLI entry point orchestrating full video ingestion pipeline"
```

---

## Task 11: Next.js — Project Setup + Database Access

**Files:**
- Create: Next.js project scaffold (via create-next-app)
- Create: `src/lib/db.ts`
- Create: `src/lib/storage.ts`

- [ ] **Step 1: Create Next.js project**

```bash
cd "/Users/dannygross/CodingProjects/Golf Coach"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

Note: This will scaffold into the current directory. Answer prompts as needed.

- [ ] **Step 2: Install dependencies**

```bash
npm install better-sqlite3 ai @ai-sdk/anthropic @huggingface/transformers
npm install -D @types/better-sqlite3
```

- [ ] **Step 3: Initialize shadcn/ui**

Check the latest shadcn docs for the init command, then:

```bash
npx shadcn@latest init
```

Install needed components:

```bash
npx shadcn@latest add card button input badge tabs scroll-area separator
```

- [ ] **Step 4: Create database access layer**

Create `src/lib/db.ts`:

```typescript
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "golf_coach.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma("journal_mode = WAL");
  }
  return db;
}

export interface LessonRow {
  id: string;
  filename: string;
  date: string;
  duration_seconds: number | null;
  source_type: string;
  source_url: string | null;
  source_metadata: string | null;
  processing_status: string;
  topic_summary: string | null;
  segment_count: number;
}

export interface SegmentRow {
  lesson_id: string;
  segment_index: number;
  start_time: number;
  end_time: number;
  topic: string;
  categories: string; // JSON array
  coach_tips: string; // JSON array
  student_observations: string; // JSON array
  visual_context: string;
  summary: string;
  frames: string; // JSON array
  transcript: string;
  speaker_map: string | null; // JSON object
}

export interface ChunkRow {
  id: string;
  lesson_id: string;
  segment_index: number;
  text: string;
  embedding: string; // JSON array of floats
  start_time: number;
  end_time: number;
  frames: string; // JSON array
}

export interface ProcessingLogRow {
  lesson_id: string;
  stage: string;
  tokens_used: number;
  timestamp: string;
  status: string;
  details: string | null;
}
```

- [ ] **Step 5: Create storage abstraction**

Create `src/lib/storage.ts`:

```typescript
import { getDb, type LessonRow, type SegmentRow, type ChunkRow, type ProcessingLogRow } from "./db";

export interface Lesson {
  id: string;
  filename: string;
  date: string;
  durationSeconds: number | null;
  sourceType: string;
  sourceUrl: string | null;
  sourceMetadata: Record<string, unknown> | null;
  processingStatus: string;
  topicSummary: string | null;
  segmentCount: number;
}

export interface Segment {
  lessonId: string;
  segmentIndex: number;
  startTime: number;
  endTime: number;
  topic: string;
  categories: string[];
  coachTips: string[];
  studentObservations: string[];
  visualContext: string;
  summary: string;
  frames: string[];
  transcript: string;
  speakerMap: Record<string, string> | null;
}

export interface Chunk {
  id: string;
  lessonId: string;
  segmentIndex: number;
  text: string;
  embedding: number[];
  startTime: number;
  endTime: number;
  frames: string[];
}

function rowToLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    filename: row.filename,
    date: row.date,
    durationSeconds: row.duration_seconds,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    sourceMetadata: row.source_metadata ? JSON.parse(row.source_metadata) : null,
    processingStatus: row.processing_status,
    topicSummary: row.topic_summary,
    segmentCount: row.segment_count,
  };
}

function rowToSegment(row: SegmentRow): Segment {
  return {
    lessonId: row.lesson_id,
    segmentIndex: row.segment_index,
    startTime: row.start_time,
    endTime: row.end_time,
    topic: row.topic,
    categories: JSON.parse(row.categories),
    coachTips: JSON.parse(row.coach_tips),
    studentObservations: JSON.parse(row.student_observations),
    visualContext: row.visual_context,
    summary: row.summary,
    frames: JSON.parse(row.frames),
    transcript: row.transcript,
    speakerMap: row.speaker_map ? JSON.parse(row.speaker_map) : null,
  };
}

export function getLessons(): Lesson[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM lessons ORDER BY date DESC").all() as LessonRow[];
  return rows.map(rowToLesson);
}

export function getLesson(id: string): Lesson | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM lessons WHERE id = ?").get(id) as LessonRow | undefined;
  return row ? rowToLesson(row) : null;
}

export function getSegments(lessonId: string): Segment[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM segments WHERE lesson_id = ? ORDER BY segment_index"
  ).all(lessonId) as SegmentRow[];
  return rows.map(rowToSegment);
}

export function getSegment(lessonId: string, segmentIndex: number): Segment | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM segments WHERE lesson_id = ? AND segment_index = ?"
  ).get(lessonId, segmentIndex) as SegmentRow | undefined;
  return row ? rowToSegment(row) : null;
}

export function getAllCategories(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT categories FROM segments").all() as { categories: string }[];
  const categorySet = new Set<string>();
  for (const row of rows) {
    const cats: string[] = JSON.parse(row.categories);
    cats.forEach((c) => categorySet.add(c));
  }
  return Array.from(categorySet).sort();
}

export function getSegmentsByCategory(category: string): Segment[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM segments WHERE categories LIKE ? ORDER BY lesson_id, segment_index"
  ).all(`%"${category}"%`) as SegmentRow[];
  return rows.map(rowToSegment);
}

export function searchSegments(query: string): Segment[] {
  const db = getDb();
  const pattern = `%${query}%`;
  const rows = db.prepare(
    `SELECT * FROM segments
     WHERE transcript LIKE ? OR summary LIKE ? OR topic LIKE ? OR coach_tips LIKE ?
     ORDER BY lesson_id, segment_index`
  ).all(pattern, pattern, pattern, pattern) as SegmentRow[];
  return rows.map(rowToSegment);
}

export function getChunksWithEmbeddings(): Chunk[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM chunks WHERE embedding IS NOT NULL").all() as ChunkRow[];
  return rows.map((row) => ({
    id: row.id,
    lessonId: row.lesson_id,
    segmentIndex: row.segment_index,
    text: row.text,
    embedding: JSON.parse(row.embedding),
    startTime: row.start_time,
    endTime: row.end_time,
    frames: JSON.parse(row.frames),
  }));
}

export function getProcessingLogs(lessonId?: string): { lessonId: string; stage: string; tokensUsed: number; timestamp: string; status: string; details: string | null }[] {
  const db = getDb();
  const query = lessonId
    ? "SELECT * FROM processing_log WHERE lesson_id = ? ORDER BY timestamp"
    : "SELECT * FROM processing_log ORDER BY timestamp DESC";
  const rows = (lessonId
    ? db.prepare(query).all(lessonId)
    : db.prepare(query).all()) as ProcessingLogRow[];
  return rows.map((r) => ({
    lessonId: r.lesson_id,
    stage: r.stage,
    tokensUsed: r.tokens_used,
    timestamp: r.timestamp,
    status: r.status,
    details: r.details,
  }));
}

export function getTotalTokensUsed(): number {
  const db = getDb();
  const row = db.prepare("SELECT COALESCE(SUM(tokens_used), 0) as total FROM processing_log").get() as { total: number };
  return row.total;
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Next.js project setup with database access and storage abstraction"
```

---

## Task 12: Next.js — Layout + Navigation

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/nav.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create navigation component**

Create `src/components/nav.tsx`:

```tsx
import Link from "next/link";

const navItems = [
  { href: "/lessons", label: "Lessons" },
  { href: "/topics", label: "Topics" },
  { href: "/search", label: "Search" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold text-lg">
          Golf Coach KB
        </Link>
        <div className="flex gap-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Update root layout**

Modify `src/app/layout.tsx` to include the Nav:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Golf Coach Knowledge Base",
  description: "Searchable knowledge base from golf coaching sessions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Update home page to redirect to lessons**

Modify `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/lessons");
}
```

- [ ] **Step 4: Verify it builds**

```bash
npm run build
```

Expected: Build succeeds (may warn about missing DB file — that's fine)

- [ ] **Step 5: Commit**

```bash
git add src/components/nav.tsx src/app/layout.tsx src/app/page.tsx
git commit -m "feat: app layout with navigation"
```

---

## Task 13: Next.js — Lesson Index Page

**Files:**
- Create: `src/app/lessons/page.tsx`
- Create: `src/components/segment-card.tsx`
- Create: `src/components/speaker-label.tsx`

- [ ] **Step 1: Create speaker label component**

Create `src/components/speaker-label.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";

export function SpeakerLabel({ speaker }: { speaker: string }) {
  const isCoach = speaker.toLowerCase() === "coach";
  return (
    <Badge variant={isCoach ? "default" : "secondary"}>
      {speaker}
    </Badge>
  );
}
```

- [ ] **Step 2: Create segment card component**

Create `src/components/segment-card.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Segment } from "@/lib/storage";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SegmentCard({ segment }: { segment: Segment }) {
  return (
    <Link href={`/lessons/${segment.lessonId}/segments/${segment.segmentIndex}`}>
      <Card className="hover:bg-accent/50 transition-colors">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{segment.topic}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground line-clamp-2">{segment.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {segment.categories.map((cat) => (
              <Badge key={cat} variant="outline" className="text-xs">
                {cat}
              </Badge>
            ))}
          </div>
          {segment.coachTips.length > 0 && (
            <p className="mt-2 text-xs text-green-700 line-clamp-1">
              Tip: {segment.coachTips[0]}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 3: Create lessons index page**

Create `src/app/lessons/page.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLessons } from "@/lib/storage";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown";
  const m = Math.floor(seconds / 60);
  return `${m} min`;
}

export default function LessonsPage() {
  const lessons = getLessons();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lessons</h1>
        <Link
          href="/lessons/new"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Add Lesson
        </Link>
      </div>

      {lessons.length === 0 ? (
        <p className="text-muted-foreground">
          No lessons yet. Add a video to get started.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lessons.map((lesson) => (
            <Link key={lesson.id} href={`/lessons/${lesson.id}`}>
              <Card className="hover:bg-accent/50 transition-colors">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{lesson.date}</CardTitle>
                    <Badge variant="outline">{lesson.sourceType}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{lesson.filename}</p>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>{formatDuration(lesson.durationSeconds)}</span>
                    <span>{lesson.segmentCount} segments</span>
                    <span className="capitalize">{lesson.processingStatus}</span>
                  </div>
                  {lesson.topicSummary && (
                    <p className="mt-2 text-sm">{lesson.topicSummary}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify it builds**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/lessons/page.tsx src/components/segment-card.tsx src/components/speaker-label.tsx
git commit -m "feat: lesson index page with lesson cards"
```

---

## Task 14: Next.js — Lesson Detail + Segment Detail Pages

**Files:**
- Create: `src/app/lessons/[id]/page.tsx`
- Create: `src/app/lessons/[id]/segments/[index]/page.tsx`
- Create: `src/components/frame-gallery.tsx`

- [ ] **Step 1: Create frame gallery component**

Create `src/components/frame-gallery.tsx`:

```tsx
import Image from "next/image";
import path from "path";

export function FrameGallery({
  frames,
  lessonId,
}: {
  frames: string[];
  lessonId: string;
}) {
  if (frames.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {frames.map((frame) => (
        <div key={frame} className="relative h-40 w-64 flex-shrink-0 rounded border overflow-hidden">
          <Image
            src={`/api/frames/${lessonId}/${frame}`}
            alt={`Frame ${frame}`}
            fill
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create frame serving API route**

Create `src/app/api/frames/[lessonId]/[filename]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; filename: string }> }
) {
  const { lessonId, filename } = await params;
  const framePath = path.join(process.cwd(), "data", "frames", lessonId, filename);

  if (!fs.existsSync(framePath)) {
    return NextResponse.json({ error: "Frame not found" }, { status: 404 });
  }

  const file = fs.readFileSync(framePath);
  return new NextResponse(file, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 3: Create lesson detail page**

Create `src/app/lessons/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getLesson, getSegments } from "@/lib/storage";
import { SegmentCard } from "@/components/segment-card";
import { Badge } from "@/components/ui/badge";

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lesson = getLesson(id);
  if (!lesson) notFound();

  const segments = getSegments(id);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{lesson.date} — {lesson.filename}</h1>
        <div className="mt-2 flex gap-2">
          <Badge variant="outline">{lesson.sourceType}</Badge>
          <Badge variant="secondary">{lesson.segmentCount} segments</Badge>
        </div>
        {lesson.sourceMetadata && (
          <div className="mt-2 text-sm text-muted-foreground">
            {(lesson.sourceMetadata as Record<string, string>).title && (
              <p>{(lesson.sourceMetadata as Record<string, string>).title}</p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3">
        {segments.map((segment) => (
          <SegmentCard key={segment.segmentIndex} segment={segment} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create segment detail page**

Create `src/app/lessons/[id]/segments/[index]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getLesson, getSegment } from "@/lib/storage";
import { Badge } from "@/components/ui/badge";
import { FrameGallery } from "@/components/frame-gallery";
import { SpeakerLabel } from "@/components/speaker-label";
import { Separator } from "@/components/ui/separator";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function SegmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; index: string }>;
}) {
  const { id, index } = await params;
  const lesson = getLesson(id);
  const segment = getSegment(id, parseInt(index, 10));

  if (!lesson || !segment) notFound();

  // Parse transcript lines into speaker-labeled chunks
  const lines = segment.transcript.split("\n").filter(Boolean);

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          {lesson.date} — {formatTime(segment.startTime)} to {formatTime(segment.endTime)}
        </p>
        <h1 className="text-2xl font-bold">{segment.topic}</h1>
        <div className="mt-2 flex flex-wrap gap-1">
          {segment.categories.map((cat) => (
            <Badge key={cat} variant="outline">{cat}</Badge>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{segment.summary}</p>

      {segment.coachTips.length > 0 && (
        <div className="mt-4 rounded-md border-l-4 border-green-500 bg-green-50 p-4">
          <h3 className="font-medium text-green-800">Coach Tips</h3>
          <ul className="mt-1 list-disc pl-4 text-sm text-green-700">
            {segment.coachTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {segment.studentObservations.length > 0 && (
        <div className="mt-3 rounded-md border-l-4 border-blue-500 bg-blue-50 p-4">
          <h3 className="font-medium text-blue-800">Your Observations</h3>
          <ul className="mt-1 list-disc pl-4 text-sm text-blue-700">
            {segment.studentObservations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        </div>
      )}

      {segment.visualContext && (
        <div className="mt-3">
          <h3 className="font-medium text-sm">Visual Context</h3>
          <p className="text-sm text-muted-foreground">{segment.visualContext}</p>
        </div>
      )}

      <FrameGallery frames={segment.frames} lessonId={segment.lessonId} />

      <Separator className="my-6" />

      <h3 className="mb-3 font-medium">Transcript</h3>
      <div className="space-y-2">
        {lines.map((line, i) => {
          const match = line.match(/^(\w+):\s*(.*)/);
          const speaker = match ? match[1] : "unknown";
          const text = match ? match[2] : line;
          return (
            <div key={i} className="flex gap-2">
              <SpeakerLabel speaker={speaker} />
              <p className="text-sm">{text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify it builds**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/lessons/ src/app/api/frames/ src/components/frame-gallery.tsx
git commit -m "feat: lesson detail and segment detail pages with frame gallery"
```

---

## Task 15: Next.js — Topics Page

**Files:**
- Create: `src/app/topics/page.tsx`

- [ ] **Step 1: Create topics page**

Create `src/app/topics/page.tsx`:

```tsx
import { getAllCategories, getSegmentsByCategory } from "@/lib/storage";
import { SegmentCard } from "@/components/segment-card";
import { Badge } from "@/components/ui/badge";

export default function TopicsPage() {
  const categories = getAllCategories();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Topics</h1>

      {categories.length === 0 ? (
        <p className="text-muted-foreground">No topics yet. Process some videos first.</p>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => {
            const segments = getSegmentsByCategory(category);
            return (
              <div key={category} id={category}>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold capitalize">{category}</h2>
                  <Badge variant="secondary">{segments.length}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {segments.map((segment) => (
                    <SegmentCard
                      key={`${segment.lessonId}-${segment.segmentIndex}`}
                      segment={segment}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/topics/page.tsx
git commit -m "feat: topics page with category-grouped segments"
```

---

## Task 16: Next.js — Search Page

**Files:**
- Create: `src/app/search/page.tsx`
- Create: `src/app/api/search/route.ts`

- [ ] **Step 1: Create search API route**

Create `src/app/api/search/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { searchSegments } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ segments: [] });
  }

  const segments = searchSegments(query.trim());
  return NextResponse.json({ segments });
}
```

- [ ] **Step 2: Create search page**

Create `src/app/search/page.tsx`:

```tsx
import { searchSegments } from "@/lib/storage";
import { SegmentCard } from "@/components/segment-card";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() || "";
  const segments = query ? searchSegments(query) : [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Search</h1>

      <form action="/search" method="GET" className="mb-6">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search tips, topics, transcripts..."
          className="w-full rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </form>

      {query && (
        <p className="mb-4 text-sm text-muted-foreground">
          {segments.length} result{segments.length !== 1 ? "s" : ""} for &quot;{query}&quot;
        </p>
      )}

      <div className="grid gap-3">
        {segments.map((segment) => (
          <SegmentCard
            key={`${segment.lessonId}-${segment.segmentIndex}`}
            segment={segment}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it builds**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/search/ src/app/api/search/
git commit -m "feat: search page with full-text search across segments"
```

---

## Task 17: Next.js — Embeddings + RAG Chat

**Files:**
- Create: `src/lib/embeddings.ts`
- Create: `src/lib/search.ts`
- Create: `src/app/api/chat/route.ts`
- Create: `src/app/chat/page.tsx`
- Create: `src/components/chat-message.tsx`

- [ ] **Step 1: Create embeddings module**

Create `src/lib/embeddings.ts`:

```typescript
import { pipeline } from "@huggingface/transformers";

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

export async function getEmbedding(text: string): Promise<number[]> {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }

  const result = await embedder(text, { pooling: "mean", normalize: true });
  // result is a Tensor — convert to flat array
  return Array.from(result.data as Float32Array);
}
```

- [ ] **Step 2: Create vector search module**

Create `src/lib/search.ts`:

```typescript
import { getChunksWithEmbeddings, getSegment, type Chunk, type Segment } from "./storage";
import { getEmbedding } from "./embeddings";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SearchResult {
  chunk: Chunk;
  segment: Segment | null;
  score: number;
}

export async function vectorSearch(query: string, topK: number = 5): Promise<SearchResult[]> {
  const queryEmbedding = await getEmbedding(query);
  const chunks = getChunksWithEmbeddings();

  const scored = chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(({ chunk, score }) => ({
    chunk,
    segment: getSegment(chunk.lessonId, chunk.segmentIndex),
    score,
  }));
}
```

- [ ] **Step 3: Create chat API route**

Create `src/app/api/chat/route.ts`:

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { vectorSearch } from "@/lib/search";

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get the latest user message for RAG retrieval
  const lastMessage = messages[messages.length - 1];
  const query = lastMessage.content;

  // Retrieve relevant context
  const results = await vectorSearch(query, 8);

  const contextBlocks = results.map((r, i) => {
    const seg = r.segment;
    const source = seg
      ? `[Lesson: ${seg.lessonId}, Segment ${seg.segmentIndex}: "${seg.topic}" (${Math.floor(seg.startTime / 60)}:${String(Math.floor(seg.startTime % 60)).padStart(2, "0")} - ${Math.floor(seg.endTime / 60)}:${String(Math.floor(seg.endTime % 60)).padStart(2, "0")})]`
      : `[Chunk ${r.chunk.id}]`;

    return `--- Context ${i + 1} (relevance: ${r.score.toFixed(2)}) ${source} ---\n${r.chunk.text}`;
  });

  const systemPrompt = `You are a golf coaching knowledge assistant. You help Danny review and recall advice from his golf coaching sessions and instruction videos.

You have access to transcripts and analysis from Danny's coaching sessions and YouTube golf instruction videos. Use the retrieved context below to answer questions accurately.

IMPORTANT RULES:
- Always cite your sources: mention which lesson, segment, and timestamp the information comes from
- If the context doesn't contain relevant information, say so honestly
- Distinguish between advice from Danny's personal coach vs YouTube instructors
- When quoting the coach, use their exact words when possible
- If Danny asks about visual data (Toptracer numbers, etc.), reference the visual context descriptions

RETRIEVED CONTEXT:
${contextBlocks.join("\n\n")}`;

  const result = streamText({
    model: anthropic("claude-sonnet-4.6"),
    system: systemPrompt,
    messages,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 4: Create chat message component**

Create `src/components/chat-message.tsx`:

```tsx
import type { UIMessage } from "ai";

export function ChatMessage({ message }: { message: UIMessage }) {
  return (
    <div
      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div key={i} className="whitespace-pre-wrap">
                {part.text}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create chat page**

Create `src/app/chat/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatMessage } from "@/components/chat-message";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <h1 className="mb-4 text-2xl font-bold">Ask Your Coach</h1>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="text-lg">Ask anything about your golf lessons</p>
              <p className="mt-2 text-sm">
                Try: &quot;What drills did my coach give me for my slice?&quot;
              </p>
              <p className="text-sm">
                Or: &quot;Summarize everything about my short game&quot;
              </p>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t pt-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your lessons..."
          className="flex-1 rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? "Thinking..." : "Ask"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Verify it builds**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/embeddings.ts src/lib/search.ts src/app/api/chat/ src/app/chat/ src/components/chat-message.tsx
git commit -m "feat: RAG chat with vector search and Claude-powered Q&A"
```

---

## Task 18: Next.js — Add New Lesson + Settings Pages

**Files:**
- Create: `src/app/lessons/new/page.tsx`
- Create: `src/app/api/ingest/route.ts`
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Create ingest API route**

Create `src/app/api/ingest/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { source, sourceType, dryRun } = body;

  const args = [
    path.join(process.cwd(), "pipeline", "ingest.py"),
    source,
    "--config", path.join(process.cwd(), "config.json"),
    "--yes",
  ];

  if (sourceType) args.push("--type", sourceType);
  if (dryRun) args.push("--dry-run");

  const pythonPath = path.join(process.cwd(), "pipeline", ".venv", "bin", "python");

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn(pythonPath, args, {
      cwd: process.cwd(),
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(NextResponse.json({ success: true, output: stdout }));
      } else {
        resolve(
          NextResponse.json(
            { success: false, error: stderr || stdout },
            { status: 500 }
          )
        );
      }
    });
  });
}
```

- [ ] **Step 2: Create add lesson page**

Create `src/app/lessons/new/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewLessonPage() {
  const [source, setSource] = useState("");
  const [sourceType, setSourceType] = useState<string>("auto");
  const [status, setStatus] = useState<"idle" | "estimating" | "processing" | "done" | "error">("idle");
  const [output, setOutput] = useState("");

  const isYouTube = source.match(/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//);

  async function handleDryRun() {
    setStatus("estimating");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          sourceType: sourceType === "auto" ? undefined : sourceType,
          dryRun: true,
        }),
      });
      const data = await res.json();
      setOutput(data.output || JSON.stringify(data, null, 2));
      setStatus("idle");
    } catch (err) {
      setOutput(String(err));
      setStatus("error");
    }
  }

  async function handleProcess() {
    setStatus("processing");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          sourceType: sourceType === "auto" ? undefined : sourceType,
          dryRun: false,
        }),
      });
      const data = await res.json();
      setOutput(data.output || JSON.stringify(data, null, 2));
      setStatus(data.success ? "done" : "error");
    } catch (err) {
      setOutput(String(err));
      setStatus("error");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Add New Lesson</h1>

      <Card>
        <CardHeader>
          <CardTitle>Video Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Video file path or YouTube URL
            </label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="/path/to/video.mov or https://youtube.com/watch?v=..."
              className="w-full rounded-md border px-4 py-2 text-sm"
            />
            {isYouTube && (
              <p className="mt-1 text-xs text-muted-foreground">
                YouTube video detected — will download via yt-dlp
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Source Type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="auto">Auto-detect</option>
              <option value="coaching">Coaching Session</option>
              <option value="youtube">YouTube</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDryRun}
              disabled={!source || status === "processing"}
            >
              {status === "estimating" ? "Estimating..." : "Estimate Cost"}
            </Button>
            <Button
              onClick={handleProcess}
              disabled={!source || status === "processing"}
            >
              {status === "processing" ? "Processing..." : "Process Video"}
            </Button>
          </div>

          {output && (
            <pre className="mt-4 max-h-60 overflow-auto rounded bg-muted p-4 text-xs">
              {output}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create settings/cost dashboard page**

Create `src/app/settings/page.tsx`:

```tsx
import { getTotalTokensUsed, getProcessingLogs, getLessons } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  let totalTokens = 0;
  let logs: ReturnType<typeof getProcessingLogs> = [];
  let lessons: ReturnType<typeof getLessons> = [];

  try {
    totalTokens = getTotalTokensUsed();
    logs = getProcessingLogs();
    lessons = getLessons();
  } catch {
    // DB might not exist yet
  }

  const tokensByLesson = new Map<string, number>();
  for (const log of logs) {
    const current = tokensByLesson.get(log.lessonId) || 0;
    tokensByLesson.set(log.lessonId, current + log.tokensUsed);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Settings & Usage</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Tokens Used</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalTokens.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Videos Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{lessons.filter((l) => l.processingStatus === "completed").length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Lessons</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{lessons.length}</p>
          </CardContent>
        </Card>
      </div>

      {tokensByLesson.size > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Tokens by Lesson</h2>
          <div className="space-y-2">
            {Array.from(tokensByLesson.entries()).map(([lessonId, tokens]) => (
              <div key={lessonId} className="flex items-center justify-between rounded border p-3">
                <span className="text-sm font-medium">{lessonId}</span>
                <span className="text-sm text-muted-foreground">{tokens.toLocaleString()} tokens</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Processing Log</h2>
          <div className="space-y-2">
            {logs.slice(0, 50).map((log, i) => (
              <div key={i} className="flex items-center gap-3 rounded border p-3 text-sm">
                <Badge variant={log.status === "success" ? "default" : "destructive"}>
                  {log.status}
                </Badge>
                <span className="font-medium">{log.lessonId}</span>
                <span className="text-muted-foreground">{log.stage}</span>
                <span className="ml-auto text-muted-foreground">
                  {log.tokensUsed.toLocaleString()} tokens
                </span>
                <span className="text-xs text-muted-foreground">{log.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify it builds**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/lessons/new/ src/app/api/ingest/ src/app/settings/
git commit -m "feat: add new lesson page with YouTube support and cost dashboard"
```

---

## Task 19: Integration — End-to-End Smoke Test

**Files:**
- Create: `scripts/seed-test-data.py`

This task creates a script that seeds the database with sample data so the web app can be tested without running the full pipeline.

- [ ] **Step 1: Create seed script**

Create `scripts/seed-test-data.py`:

```python
"""Seed the database with sample data for testing the web app."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pipeline.src.db import Database
from pipeline.src.models import Lesson, Segment, ProcessingLog
from pipeline.src.embed import chunk_segments, generate_embeddings
import json

DB_PATH = "data/golf_coach.db"


def seed():
    os.makedirs("data/frames/demo-lesson-1", exist_ok=True)

    db = Database(DB_PATH)

    # Insert a sample lesson
    db.insert_lesson(Lesson(
        id="demo-lesson-1",
        filename="demo-recording.mov",
        date="2025-05-08",
        duration_seconds=1800,
        source_type="coaching",
        processing_status="completed",
        topic_summary="Driver and iron work with focus on takeaway and ball position",
        segment_count=3,
    ))

    # Insert sample segments
    segments = [
        Segment(
            lesson_id="demo-lesson-1", segment_index=0,
            start_time=0.0, end_time=120.0,
            topic="Driver Takeaway Path",
            categories=["driver", "takeaway", "club path"],
            coach_tips=[
                "Keep the clubhead outside your hands in the first 18 inches",
                "Think about pushing the club straight back, not inside",
            ],
            student_observations=["I feel like I'm pulling it inside too quickly"],
            visual_context="Toptracer shows club path at -3.2 degrees (out-to-in)",
            summary="Coach addresses the over-the-top move by focusing on the takeaway path, using Toptracer club path data.",
            frames=[],
            transcript="coach: Let's look at your takeaway. See how the club is coming inside immediately?\ndanny: Yeah, I feel like I'm pulling it inside too quickly.\ncoach: Exactly. I want you to keep the clubhead outside your hands for the first 18 inches. Think about pushing the club straight back.",
        ),
        Segment(
            lesson_id="demo-lesson-1", segment_index=1,
            start_time=120.0, end_time=300.0,
            topic="Iron Ball Position",
            categories=["irons", "ball position", "setup"],
            coach_tips=[
                "7-iron ball position should be one ball width ahead of center",
                "Check ball position by laying a club on the ground perpendicular to target",
            ],
            student_observations=["I think I've been playing the ball too far back"],
            visual_context="Camera shows ball position relative to stance from down-the-line angle",
            summary="Adjusting ball position for mid-irons to improve strike quality.",
            frames=[],
            transcript="coach: Where do you normally play your 7-iron?\ndanny: I think I've been playing the ball too far back.\ncoach: Let's check. Lay a club down perpendicular to your target line. Your 7-iron should be one ball width ahead of center.",
        ),
        Segment(
            lesson_id="demo-lesson-1", segment_index=2,
            start_time=300.0, end_time=480.0,
            topic="Grip Pressure",
            categories=["grip", "tension", "mental game"],
            coach_tips=[
                "Hold the club like you're holding a bird — firm enough it won't fly away, gentle enough you won't hurt it",
                "On a scale of 1-10, aim for a 4-5 grip pressure",
            ],
            student_observations=["I tend to squeeze tighter when I'm nervous on the course"],
            visual_context="Close-up of grip showing knuckle whiteness indicating too much pressure",
            summary="Reducing grip pressure to improve clubhead speed and consistency.",
            frames=[],
            transcript="coach: Show me your grip pressure right now. See how white your knuckles are?\ndanny: I tend to squeeze tighter when I'm nervous on the course.\ncoach: Hold the club like you're holding a bird. Firm enough it won't fly away, gentle enough you won't hurt it. On a scale of 1-10, aim for a 4-5.",
        ),
    ]

    for seg in segments:
        db.insert_segment(seg)

    # Generate chunks and embeddings
    chunks = chunk_segments(segments)
    if chunks:
        embeddings = generate_embeddings([c.text for c in chunks])
        for chunk, embedding in zip(chunks, embeddings):
            db.conn.execute(
                """INSERT INTO chunks (id, lesson_id, segment_index, text, embedding,
                   start_time, end_time, frames) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (chunk.id, chunk.lesson_id, chunk.segment_index, chunk.text,
                 json.dumps(embedding), chunk.start_time, chunk.end_time,
                 json.dumps(chunk.frames)),
            )
        db.conn.commit()

    # Add processing log
    db.insert_processing_log(ProcessingLog(
        lesson_id="demo-lesson-1", stage="complete",
        tokens_used=25000, timestamp="2025-05-08T14:00:00",
        status="success", details="3 segments, 3 chunks (seed data)",
    ))

    db.close()
    print(f"Seeded {DB_PATH} with 1 lesson, 3 segments, {len(chunks)} chunks")


if __name__ == "__main__":
    seed()
```

- [ ] **Step 2: Run the seed script**

```bash
cd "/Users/dannygross/CodingProjects/Golf Coach"
source pipeline/.venv/bin/activate
python scripts/seed-test-data.py
```

Expected: `Seeded data/golf_coach.db with 1 lesson, 3 segments, 3 chunks`

- [ ] **Step 3: Start the Next.js dev server and verify**

```bash
npm run dev
```

Open `http://localhost:3000` and verify:
- Lessons page shows 1 lesson card
- Clicking the lesson shows 3 segments
- Clicking a segment shows transcript, tips, observations
- Topics page groups segments by category
- Search for "grip" returns the grip segment
- Chat page loads and sends messages
- Settings page shows token usage

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-test-data.py
git commit -m "feat: seed script for testing web app with sample coaching data"
```

---

## Task 20: Final — Run Full Pipeline on Real Videos

This is the manual integration test against Danny's actual recordings.

- [ ] **Step 1: Ensure ffmpeg is installed**

```bash
ffmpeg -version
```

If not installed: `brew install ffmpeg`

- [ ] **Step 2: Install whisperx**

```bash
source pipeline/.venv/bin/activate
pip install whisperx torch
```

- [ ] **Step 3: Install yt-dlp**

```bash
pip install yt-dlp
```

- [ ] **Step 4: Dry run on first video**

```bash
python pipeline/ingest.py "Recordings/ScreenRecording_05-08-2025 12-29-16_1.mov" --type coaching --dry-run
```

Review the token estimate. Adjust `config.json` if needed.

- [ ] **Step 5: Process first video**

```bash
python pipeline/ingest.py "Recordings/ScreenRecording_05-08-2025 12-29-16_1.mov" --type coaching --yes
```

Monitor output. Check that segments appear reasonable.

- [ ] **Step 6: Verify in web app**

```bash
npm run dev
```

Open `http://localhost:3000` and verify the real lesson data appears correctly.

- [ ] **Step 7: Process remaining videos**

Process each remaining video one at a time:

```bash
python pipeline/ingest.py "Recordings/ScreenRecording_05-08-2025 12-34-04_1.mov" --type coaching --yes
python pipeline/ingest.py "Recordings/ScreenRecording_05-08-2025 12-44-15_1.mov" --type coaching --yes
python pipeline/ingest.py "Recordings/ScreenRecording_05-08-2025 12-56-30_1.mov" --type coaching --yes
python pipeline/ingest.py "Recordings/ScreenRecording_05-08-2025 13-08-13_1.mov" --type coaching --yes
```

- [ ] **Step 8: Final verification**

Browse all lessons, search across them, and try chat queries like:
- "What did my coach say about my driver?"
- "What drills was I given?"
- "Summarize everything about my grip"
