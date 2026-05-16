"""Database access layer for the Golf Coach demo schema.

Wraps a SQLite connection with sqlite-vec loaded, applies schema.sql
on first run, and exposes typed CRUD methods backed by parameterized
queries.

Usage:
    from database import Database
    from models import Video

    db = Database("data/golf_coach_demo.db")
    db.init_schema()
    video_id = db.insert_video(Video(
        source="trackman",
        filename="lesson_2024-05-12.mp4",
        file_path="/path/to/lesson_2024-05-12.mp4",
    ))
    db.close()

CLI:
    python database.py init [db_path]    # apply schema if not already
    python database.py reset [db_path]   # drop everything, re-apply
"""
from __future__ import annotations

# Apple's bundled Python builds sqlite3 without extension support.
# pysqlite3-binary ships a modern SQLite with extensions enabled and
# is a drop-in API match — prefer it when available.
try:
    import pysqlite3 as sqlite3  # type: ignore
except ImportError:
    import sqlite3

from dataclasses import asdict, fields
from datetime import datetime, date
from pathlib import Path
from typing import Optional, Sequence

try:
    import sqlite_vec
except ImportError as e:
    raise ImportError(
        "sqlite-vec is required. Install with: pip install sqlite-vec"
    ) from e

from models import (
    Video, Coach, Session, SessionVideo, Transcript, Segment,
    Topic, Drill, TopicMention, DrillMention, Chunk,
    ProcessingLog, SkippedVideo,
)

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


# ---- Datetime / date adapters (Python 3.12 deprecated the defaults) ----
def _adapt_datetime(dt: datetime) -> str:
    return dt.isoformat(sep=" ")

def _adapt_date(d: date) -> str:
    return d.isoformat()

def _convert_datetime(b: bytes) -> datetime:
    return datetime.fromisoformat(b.decode())

def _convert_date(b: bytes) -> date:
    return date.fromisoformat(b.decode())

sqlite3.register_adapter(datetime, _adapt_datetime)
sqlite3.register_adapter(date, _adapt_date)
sqlite3.register_converter("timestamp", _convert_datetime)
sqlite3.register_converter("date", _convert_date)


class Database:
    """Thin typed wrapper around sqlite3 for the golf coach schema."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(
            self.path, detect_types=sqlite3.PARSE_DECLTYPES
        )
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self._load_vec_extension()

    def _load_vec_extension(self) -> None:
        self.conn.enable_load_extension(True)
        sqlite_vec.load(self.conn)
        self.conn.enable_load_extension(False)

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Schema management
    # ------------------------------------------------------------------
    def init_schema(self, force: bool = False) -> bool:
        """Apply schema.sql. Returns True if applied, False if already present.

        force=True drops every user table first — use only for resets.
        """
        if force:
            self._drop_all_tables()
        if self._is_initialized() and not force:
            return False
        schema_sql = SCHEMA_PATH.read_text()
        self.conn.executescript(schema_sql)
        self.conn.commit()
        return True

    def _is_initialized(self) -> bool:
        row = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='videos'"
        ).fetchone()
        return row is not None

    def _drop_all_tables(self) -> None:
        rows = self.conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        for r in rows:
            self.conn.execute(f"DROP TABLE IF EXISTS {r['name']}")
        self.conn.commit()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _insert(self, table: str, obj) -> int:
        """Insert a dataclass row. Skips id and any None-valued fields
        (so DB defaults / NULLs apply). Returns the new rowid."""
        data = {k: v for k, v in asdict(obj).items() if k != "id" and v is not None}
        cols = ", ".join(data.keys())
        placeholders = ", ".join("?" for _ in data)
        cursor = self.conn.execute(
            f"INSERT INTO {table} ({cols}) VALUES ({placeholders})",
            list(data.values()),
        )
        self.conn.commit()
        return cursor.lastrowid

    def _row_to(self, row, cls):
        if row is None:
            return None
        valid = {f.name for f in fields(cls)}
        return cls(**{k: row[k] for k in row.keys() if k in valid})

    # ------------------------------------------------------------------
    # Videos
    # ------------------------------------------------------------------
    def insert_video(self, video: Video) -> int:
        return self._insert("videos", video)

    def get_video(self, video_id: int) -> Optional[Video]:
        row = self.conn.execute(
            "SELECT * FROM videos WHERE id = ?", (video_id,)
        ).fetchone()
        return self._row_to(row, Video)

    def get_video_by_hash(self, file_hash: str) -> Optional[Video]:
        row = self.conn.execute(
            "SELECT * FROM videos WHERE file_hash = ?", (file_hash,)
        ).fetchone()
        return self._row_to(row, Video)

    def list_videos(
        self,
        status: Optional[str] = None,
        source: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list[Video]:
        query = "SELECT * FROM videos"
        params: list = []
        conditions = []
        if status:
            conditions.append("status = ?")
            params.append(status)
        if source:
            conditions.append("source = ?")
            params.append(source)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY recorded_at DESC"
        if limit:
            query += f" LIMIT {int(limit)}"
        rows = self.conn.execute(query, params).fetchall()
        return [self._row_to(r, Video) for r in rows]

    def update_video_status(self, video_id: int, status: str) -> None:
        self.conn.execute(
            "UPDATE videos SET status = ? WHERE id = ?", (status, video_id)
        )
        self.conn.commit()

    def count_videos(self, status: Optional[str] = None) -> int:
        if status:
            row = self.conn.execute(
                "SELECT COUNT(*) AS n FROM videos WHERE status = ?", (status,)
            ).fetchone()
        else:
            row = self.conn.execute("SELECT COUNT(*) AS n FROM videos").fetchone()
        return row["n"]

    # ------------------------------------------------------------------
    # Coaches & sessions
    # ------------------------------------------------------------------
    def insert_coach(self, coach: Coach) -> int:
        return self._insert("coaches", coach)

    def find_or_create_coach(self, name: str, facility: Optional[str] = None) -> int:
        row = self.conn.execute(
            "SELECT id FROM coaches WHERE name = ?", (name,)
        ).fetchone()
        if row:
            return row["id"]
        return self.insert_coach(Coach(name=name, facility=facility))

    def insert_session(self, session: Session) -> int:
        return self._insert("sessions", session)

    def get_session(self, session_id: int) -> Optional[Session]:
        row = self.conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        return self._row_to(row, Session)

    def add_video_to_session(
        self, session_id: int, video_id: int, sequence: Optional[int] = None
    ) -> None:
        self.conn.execute(
            "INSERT INTO session_videos (session_id, video_id, sequence) "
            "VALUES (?, ?, ?)",
            (session_id, video_id, sequence),
        )
        self.conn.commit()

    # ------------------------------------------------------------------
    # Transcripts & segments
    # ------------------------------------------------------------------
    def insert_transcript(self, transcript: Transcript) -> int:
        return self._insert("transcripts", transcript)

    def get_transcript_for_video(self, video_id: int) -> Optional[Transcript]:
        row = self.conn.execute(
            "SELECT * FROM transcripts WHERE video_id = ?", (video_id,)
        ).fetchone()
        return self._row_to(row, Transcript)

    def insert_segment(self, segment: Segment) -> int:
        return self._insert("segments", segment)

    def list_segments_for_video(self, video_id: int) -> list[Segment]:
        rows = self.conn.execute(
            "SELECT * FROM segments WHERE video_id = ? ORDER BY start_seconds",
            (video_id,),
        ).fetchall()
        return [self._row_to(r, Segment) for r in rows]

    # ------------------------------------------------------------------
    # Topics, drills, and timestamped mentions
    # ------------------------------------------------------------------
    def find_or_create_topic(self, name: str, category: Optional[str] = None) -> int:
        row = self.conn.execute(
            "SELECT id FROM topics WHERE name = ?", (name,)
        ).fetchone()
        if row:
            return row["id"]
        return self._insert("topics", Topic(name=name, category=category))

    def find_or_create_drill(
        self, name: str, description: Optional[str] = None, category: Optional[str] = None
    ) -> int:
        row = self.conn.execute(
            "SELECT id FROM drills WHERE name = ?", (name,)
        ).fetchone()
        if row:
            return row["id"]
        return self._insert(
            "drills", Drill(name=name, description=description, category=category)
        )

    def list_topics(self) -> list[Topic]:
        rows = self.conn.execute("SELECT * FROM topics ORDER BY name").fetchall()
        return [self._row_to(r, Topic) for r in rows]

    def list_drills(self) -> list[Drill]:
        rows = self.conn.execute("SELECT * FROM drills ORDER BY name").fetchall()
        return [self._row_to(r, Drill) for r in rows]

    def insert_topic_mention(self, mention: TopicMention) -> int:
        return self._insert("topic_mentions", mention)

    def insert_drill_mention(self, mention: DrillMention) -> int:
        return self._insert("drill_mentions", mention)

    def list_topic_mentions_for_video(self, video_id: int) -> list[TopicMention]:
        rows = self.conn.execute(
            "SELECT * FROM topic_mentions WHERE video_id = ? ORDER BY start_seconds",
            (video_id,),
        ).fetchall()
        return [self._row_to(r, TopicMention) for r in rows]

    def list_drill_mentions_for_video(self, video_id: int) -> list[DrillMention]:
        rows = self.conn.execute(
            "SELECT * FROM drill_mentions WHERE video_id = ? ORDER BY start_seconds",
            (video_id,),
        ).fetchall()
        return [self._row_to(r, DrillMention) for r in rows]

    # ------------------------------------------------------------------
    # Chunks + vector search
    # ------------------------------------------------------------------
    def insert_chunk(self, chunk: Chunk, embedding: Sequence[float]) -> int:
        """Insert a chunk and its embedding together.

        chunks_vec shares rowid with chunks — this method is the only
        sanctioned way to write a chunk, so they can never drift.
        """
        chunk_id = self._insert("chunks", chunk)
        emb_blob = sqlite_vec.serialize_float32(list(embedding))
        self.conn.execute(
            "INSERT INTO chunks_vec(rowid, embedding) VALUES (?, ?)",
            (chunk_id, emb_blob),
        )
        self.conn.commit()
        return chunk_id

    def search_chunks(
        self, query_embedding: Sequence[float], k: int = 5
    ) -> list[tuple[Chunk, float]]:
        """ANN search across all embedded chunks.

        Returns (chunk, distance) pairs, lower distance = better match.
        """
        emb_blob = sqlite_vec.serialize_float32(list(query_embedding))
        rows = self.conn.execute(
            """
            SELECT c.*, v.distance AS distance
            FROM chunks_vec v
            JOIN chunks c ON c.id = v.rowid
            WHERE v.embedding MATCH ? AND k = ?
            ORDER BY v.distance
            """,
            (emb_blob, k),
        ).fetchall()
        results: list[tuple[Chunk, float]] = []
        for r in rows:
            chunk = self._row_to(r, Chunk)
            results.append((chunk, r["distance"]))
        return results

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------
    def log_processing(self, log: ProcessingLog) -> int:
        return self._insert("processing_log", log)

    def insert_skipped_video(self, skipped: SkippedVideo) -> int:
        return self._insert("skipped_videos", skipped)

    def list_skipped_videos(self, reason: Optional[str] = None) -> list[SkippedVideo]:
        if reason:
            rows = self.conn.execute(
                "SELECT * FROM skipped_videos WHERE reason = ? ORDER BY skipped_at DESC",
                (reason,),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM skipped_videos ORDER BY skipped_at DESC"
            ).fetchall()
        return [self._row_to(r, SkippedVideo) for r in rows]

    def count_skipped_videos(self) -> int:
        row = self.conn.execute("SELECT COUNT(*) AS n FROM skipped_videos").fetchone()
        return row["n"]


# ---- CLI ----------------------------------------------------------------
def main() -> None:
    import sys
    args = sys.argv[1:]
    if not args or args[0] not in ("init", "reset"):
        print("Usage: python database.py {init|reset} [db_path]")
        sys.exit(1)
    cmd = args[0]
    db_path = args[1] if len(args) > 1 else "data/golf_coach_demo.db"
    db = Database(db_path)
    applied = db.init_schema(force=(cmd == "reset"))
    if applied:
        print(f"Schema applied to {db_path}")
    else:
        print(f"DB already initialized at {db_path} (use 'reset' to wipe)")
    # quick sanity print
    table_rows = db.conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    print(f"Tables ({len(table_rows)}): {', '.join(r['name'] for r in table_rows)}")
    db.close()


if __name__ == "__main__":
    main()
