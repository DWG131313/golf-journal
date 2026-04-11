import json
import sqlite3
from pathlib import Path
from typing import List, Optional

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

    def get_lesson(self, lesson_id: str) -> Optional[Lesson]:
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

    def list_lessons(self) -> List[Lesson]:
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

    def get_segments(self, lesson_id: str) -> List[Segment]:
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

    def get_processing_logs(self, lesson_id: str) -> List[ProcessingLog]:
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

    def get_total_tokens(self, lesson_id: Optional[str] = None) -> int:
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
