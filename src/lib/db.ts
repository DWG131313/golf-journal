import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "golf_coach.db");

let db: Database.Database | null = null;

/** Create an empty database with the expected schema. */
function initEmptyDb(): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = new Database(DB_PATH);
  tmp.exec(`
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
  `);
  tmp.close();
}

export function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(DB_PATH)) {
      initEmptyDb();
    }
    db = new Database(DB_PATH, { readonly: true });
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
  embedding: string; // JSON array of floats (stored as text in BLOB column)
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
