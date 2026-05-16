-- Golf Coach knowledge base — fresh schema for the src-demo dashboard.
-- Designed around TrackMan video ingest + lesson-only content.
-- Silent swing clips are filtered before insert and moved to a side folder;
-- a row is written to skipped_videos for audit only.

PRAGMA foreign_keys = ON;


-- ============================================================
-- 1. Sources
-- ============================================================
-- Every ingested video that has actual coaching content gets a
-- row here. Silent swing clips never reach this table — they're
-- recorded in skipped_videos instead.

CREATE TABLE videos (
  id              INTEGER PRIMARY KEY,
  source          TEXT NOT NULL,                -- 'trackman' | 'local' | 'upload'
  source_ref      TEXT,                          -- TrackMan ID or upload UUID
  filename        TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_hash       TEXT UNIQUE,                   -- dedupe re-uploads / re-downloads
  duration_seconds REAL,
  speech_seconds  REAL,                          -- minutes of detected speech
  recorded_at     TIMESTAMP,                     -- pulled from filename / EXIF / mtime
  ingested_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status          TEXT DEFAULT 'pending',        -- pending → classified → transcribed → analyzed → embedded
  thumbnail_path  TEXT,
  notes           TEXT
);

CREATE INDEX idx_videos_status        ON videos(status);
CREATE INDEX idx_videos_recorded_at   ON videos(recorded_at);
CREATE INDEX idx_videos_source        ON videos(source);


-- ============================================================
-- 2. Grouping: coaches + sessions
-- ============================================================
-- A "session" is a coaching hour that often produces multiple
-- videos. Useful for the "show me everything from May 2024 with
-- Coach X" view.

CREATE TABLE coaches (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  facility  TEXT
);

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY,
  date        DATE NOT NULL,
  coach_id    INTEGER REFERENCES coaches(id),
  facility    TEXT,
  summary     TEXT,                              -- LLM-written session recap
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE session_videos (
  session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  video_id    INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  sequence    INTEGER,                           -- order within the session
  PRIMARY KEY (session_id, video_id)
);

CREATE INDEX idx_sessions_date     ON sessions(date);
CREATE INDEX idx_sessions_coach_id ON sessions(coach_id);


-- ============================================================
-- 3. Content: transcript + topical segments
-- ============================================================
-- transcripts: one per video, the raw output of whisper + diarization.
-- segments:    LLM-produced topical slices ("5:20–9:40, draw shot face control").
--              This is what the dashboard mostly shows.

CREATE TABLE transcripts (
  id              INTEGER PRIMARY KEY,
  video_id        INTEGER UNIQUE NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  full_text       TEXT NOT NULL,
  segments_json   TEXT,                          -- whisper segment array with timestamps
  speakers_json   TEXT,                          -- diarization output
  language        TEXT DEFAULT 'en',
  word_count      INTEGER,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE segments (
  id                INTEGER PRIMARY KEY,
  video_id          INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  start_seconds     REAL NOT NULL,
  end_seconds       REAL NOT NULL,
  title             TEXT,                        -- "Backswing rotation"
  summary           TEXT,                        -- 1–2 sentence takeaway
  key_points_json   TEXT,                        -- bullet list, JSON array
  transcript_text   TEXT,                        -- transcript for just this slice
  dominant_speaker  TEXT,                        -- 'coach' | 'student' — whoever speaks most in this slice
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_segments_video_id ON segments(video_id);
CREATE INDEX idx_segments_start    ON segments(video_id, start_seconds);


-- ============================================================
-- 4. Taxonomy + timestamped mentions
-- ============================================================
-- A topic or drill can be referenced at multiple precise moments
-- within a video. Mentions carry timestamps so the dashboard can
-- deep-link to the exact spot ("Jump to the L-to-L drill at 12:34").
-- These tables ARE the topic↔segment relationship — no separate
-- junction table is needed.

CREATE TABLE topics (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,                -- "Draw shot mechanics"
  category  TEXT                                 -- 'mechanics' | 'mental' | 'short-game' | 'putting'
);

CREATE TABLE drills (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,             -- "L-to-L drill"
  description  TEXT,
  category     TEXT                              -- 'tempo' | 'sequencing' | 'face control'
);

CREATE TABLE topic_mentions (
  id             INTEGER PRIMARY KEY,
  video_id       INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  segment_id     INTEGER REFERENCES segments(id) ON DELETE SET NULL,
  topic_id       INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  start_seconds  REAL NOT NULL,
  end_seconds    REAL,
  quote          TEXT,                           -- the actual phrase from the transcript
  speaker        TEXT                            -- 'coach' | 'student'
);

CREATE TABLE drill_mentions (
  id             INTEGER PRIMARY KEY,
  video_id       INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  segment_id     INTEGER REFERENCES segments(id) ON DELETE SET NULL,
  drill_id       INTEGER NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  start_seconds  REAL NOT NULL,
  end_seconds    REAL,
  quote          TEXT,
  speaker        TEXT                            -- 'coach' | 'student'
);

CREATE INDEX idx_topic_mentions_video ON topic_mentions(video_id, start_seconds);
CREATE INDEX idx_topic_mentions_topic ON topic_mentions(topic_id);
CREATE INDEX idx_drill_mentions_video ON drill_mentions(video_id, start_seconds);
CREATE INDEX idx_drill_mentions_drill ON drill_mentions(drill_id);


-- ============================================================
-- 5. Embeddings — sqlite-vec virtual table for ANN search
-- ============================================================
-- chunks: human-readable metadata + text
-- chunks_vec: the actual vector store
-- Link by rowid: chunks.id == chunks_vec.rowid
--
-- NOTE: the sqlite-vec extension must be loaded on connection.
-- (Python: db.enable_load_extension(True); db.load_extension('vec0')
--  Node:   db.loadExtension('vec0'))

CREATE TABLE chunks (
  id               INTEGER PRIMARY KEY,
  segment_id       INTEGER REFERENCES segments(id) ON DELETE CASCADE,
  video_id         INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  chunk_text       TEXT NOT NULL,
  chunk_index      INTEGER NOT NULL,
  embedding_model  TEXT NOT NULL,                -- e.g. 'sentence-transformers/all-MiniLM-L6-v2'
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chunks_segment ON chunks(segment_id);
CREATE INDEX idx_chunks_video   ON chunks(video_id);

-- Vector dim 384 matches sentence-transformers all-MiniLM-L6-v2.
-- Bump if you swap embedding models.
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  embedding FLOAT[384]
);


-- ============================================================
-- 6. Observability
-- ============================================================
-- processing_log: one row per pipeline stage attempt, for cost
--                 tracking and debugging the batch run.
-- skipped_videos: audit log for silent swing clips that got
--                 filtered out before reaching the videos table.

CREATE TABLE processing_log (
  id          INTEGER PRIMARY KEY,
  video_id    INTEGER REFERENCES videos(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,                    -- 'classify' | 'transcribe' | 'analyze' | 'embed'
  status      TEXT NOT NULL,                    -- 'started' | 'success' | 'failed' | 'skipped'
  duration_ms INTEGER,
  cost_cents  REAL,
  error       TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE skipped_videos (
  id                INTEGER PRIMARY KEY,
  filename          TEXT NOT NULL,
  original_path     TEXT NOT NULL,
  moved_to_path     TEXT,                       -- where the file got moved to
  duration_seconds  REAL,
  speech_seconds    REAL,                       -- usually ~0 for swing-only clips
  reason            TEXT NOT NULL,              -- 'silent_swing_clip' | 'too_short' | 'duplicate' | 'corrupt'
  skipped_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_processing_log_video ON processing_log(video_id, stage);
CREATE INDEX idx_skipped_videos_reason ON skipped_videos(reason);
