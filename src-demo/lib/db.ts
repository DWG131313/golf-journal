import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "node:path";

// DB sits at <project-root>/data/golf_coach_demo.db. When `next dev` runs
// from src-demo/, ".." resolves to the project root. Override via env.
const DB_PATH =
  process.env.GOLF_DB_PATH ||
  path.resolve(process.cwd(), "..", "data", "golf_coach_demo.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  _db = db;
  return db;
}

export type Video = {
  id: number;
  source: string;
  filename: string;
  file_path: string;
  duration_seconds: number | null;
  speech_seconds: number | null;
  recorded_at: string | null;
  status: string;
  thumbnail_path: string | null;
};

export type VideoSummary = Video & {
  segment_count: number;
  topic_count: number;
};

export function listAllVideos(): VideoSummary[] {
  return getDb()
    .prepare(
      `SELECT v.*,
              (SELECT COUNT(*) FROM segments       WHERE video_id = v.id) AS segment_count,
              (SELECT COUNT(*) FROM topic_mentions WHERE video_id = v.id) AS topic_count
       FROM videos v
       ORDER BY v.recorded_at DESC`,
    )
    .all() as VideoSummary[];
}

export type StatusCount = { status: string; n: number };

export function countByStatus(): StatusCount[] {
  return getDb()
    .prepare(
      `SELECT status, COUNT(*) AS n FROM videos GROUP BY status ORDER BY n DESC`,
    )
    .all() as StatusCount[];
}

// ----------------------------------------------------------------------
// Lesson detail
// ----------------------------------------------------------------------
export type Transcript = {
  id: number;
  video_id: number;
  full_text: string;
  segments_json: string | null;
  speakers_json: string | null;
  language: string;
  word_count: number | null;
};

export function getVideoById(id: number): Video | null {
  const row = getDb()
    .prepare("SELECT * FROM videos WHERE id = ?")
    .get(id) as Video | undefined;
  return row ?? null;
}

export function getTranscriptForVideo(videoId: number): Transcript | null {
  const row = getDb()
    .prepare("SELECT * FROM transcripts WHERE video_id = ?")
    .get(videoId) as Transcript | undefined;
  return row ?? null;
}

export type Segment = {
  id: number;
  video_id: number;
  start_seconds: number;
  end_seconds: number;
  title: string | null;
  summary: string | null;
  key_points_json: string | null;
  transcript_text: string | null;
  dominant_speaker: string | null;
};

export function listSegmentsForVideo(videoId: number): Segment[] {
  return getDb()
    .prepare(
      `SELECT * FROM segments WHERE video_id = ? ORDER BY start_seconds`,
    )
    .all(videoId) as Segment[];
}

export type TopicMentionRow = {
  id: number;
  video_id: number;
  segment_id: number | null;
  topic_id: number;
  topic_name: string;
  topic_category: string | null;
  start_seconds: number;
  end_seconds: number | null;
  quote: string | null;
  speaker: string | null;
};

export function listTopicMentionsForVideo(videoId: number): TopicMentionRow[] {
  return getDb()
    .prepare(
      `SELECT tm.*, t.name AS topic_name, t.category AS topic_category
       FROM topic_mentions tm
       JOIN topics t ON t.id = tm.topic_id
       WHERE tm.video_id = ?
       ORDER BY tm.start_seconds`,
    )
    .all(videoId) as TopicMentionRow[];
}

export type DrillMentionRow = {
  id: number;
  video_id: number;
  segment_id: number | null;
  drill_id: number;
  drill_name: string;
  drill_category: string | null;
  start_seconds: number;
  end_seconds: number | null;
  quote: string | null;
  speaker: string | null;
};

export function listDrillMentionsForVideo(videoId: number): DrillMentionRow[] {
  return getDb()
    .prepare(
      `SELECT dm.*, d.name AS drill_name, d.category AS drill_category
       FROM drill_mentions dm
       JOIN drills d ON d.id = dm.drill_id
       WHERE dm.video_id = ?
       ORDER BY dm.start_seconds`,
    )
    .all(videoId) as DrillMentionRow[];
}

// ----------------------------------------------------------------------
// Topics index
// ----------------------------------------------------------------------
export type TopicWithCount = {
  topic_id: number;
  name: string;
  category: string | null;
  mention_count: number;
  lesson_count: number;
};

export function listTopicsWithMentionCounts(): TopicWithCount[] {
  return getDb()
    .prepare(
      `SELECT t.id AS topic_id,
              t.name,
              t.category,
              COUNT(tm.id) AS mention_count,
              COUNT(DISTINCT tm.video_id) AS lesson_count
       FROM topics t
       LEFT JOIN topic_mentions tm ON tm.topic_id = t.id
       GROUP BY t.id
       ORDER BY mention_count DESC, t.name ASC`,
    )
    .all() as TopicWithCount[];
}

export type TopicLessonMention = {
  video_id: number;
  filename: string;
  recorded_at: string | null;
  start_seconds: number;
  end_seconds: number | null;
  quote: string | null;
  speaker: string | null;
  segment_title: string | null;
  segment_summary: string | null;
};

export function listMentionsForTopic(topicId: number): TopicLessonMention[] {
  return getDb()
    .prepare(
      `SELECT tm.video_id,
              v.filename,
              v.recorded_at,
              tm.start_seconds,
              tm.end_seconds,
              tm.quote,
              tm.speaker,
              s.title AS segment_title,
              s.summary AS segment_summary
       FROM topic_mentions tm
       JOIN videos v ON v.id = tm.video_id
       LEFT JOIN segments s ON s.id = tm.segment_id
       WHERE tm.topic_id = ?
       ORDER BY v.recorded_at DESC, tm.start_seconds ASC`,
    )
    .all(topicId) as TopicLessonMention[];
}

export type TopicRow = {
  id: number;
  name: string;
  category: string | null;
};

export function getTopicById(id: number): TopicRow | null {
  const row = getDb()
    .prepare("SELECT id, name, category FROM topics WHERE id = ?")
    .get(id) as TopicRow | undefined;
  return row ?? null;
}

// ----------------------------------------------------------------------
// Display helpers — used by editorial pages
// ----------------------------------------------------------------------

// Bulk lookup of the first segment's title for a set of videos. Avoids
// N+1 queries on the home page when we want a "headline" per lesson.
export function getFirstSegmentTitles(
  videoIds: number[],
): Map<number, string | null> {
  const map = new Map<number, string | null>();
  if (videoIds.length === 0) return map;
  const placeholders = videoIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT s.video_id, s.title
       FROM segments s
       JOIN (
         SELECT video_id, MIN(start_seconds) AS first_s
         FROM segments
         WHERE video_id IN (${placeholders})
         GROUP BY video_id
       ) firsts
         ON s.video_id = firsts.video_id AND s.start_seconds = firsts.first_s`,
    )
    .all(...videoIds) as { video_id: number; title: string | null }[];
  for (const r of rows) map.set(r.video_id, r.title);
  return map;
}

// First segment summary for a single video — used as the lesson's
// "headline" on the detail page and featured-card on the home page.
export function getFirstSegmentForVideo(videoId: number): {
  title: string | null;
  summary: string | null;
} | null {
  const row = getDb()
    .prepare(
      `SELECT title, summary FROM segments WHERE video_id = ?
       ORDER BY start_seconds LIMIT 1`,
    )
    .get(videoId) as { title: string | null; summary: string | null } | undefined;
  return row ?? null;
}

// Practice themes: topics in the most recent N lessons, ranked by frequency,
// with the date of the most recent mention. Replaces the previous topic-cloud
// view with a scannable, comparable list. Used on the home page.
export type PracticeTheme = {
  topic_id: number;
  name: string;
  category: string | null;
  mention_count: number;
  last_mentioned_at: string | null;
};

export function listPracticeThemes(
  lessonCount: number = 5,
  limit: number = 7,
): PracticeTheme[] {
  return getDb()
    .prepare(
      `WITH recent AS (
         SELECT id FROM videos
         WHERE status IN ('analyzed','embedded')
         ORDER BY recorded_at DESC LIMIT ?
       )
       SELECT t.id AS topic_id, t.name, t.category,
              COUNT(tm.id) AS mention_count,
              MAX(v.recorded_at) AS last_mentioned_at
       FROM topic_mentions tm
       JOIN topics t ON t.id = tm.topic_id
       JOIN videos v ON v.id = tm.video_id
       WHERE tm.video_id IN (SELECT id FROM recent)
       GROUP BY t.id
       ORDER BY mention_count DESC, last_mentioned_at DESC
       LIMIT ?`,
    )
    .all(lessonCount, limit) as PracticeTheme[];
}

// Drills surfaced in recent lessons — actionable practice prescriptions.
// Sparse data right now (5 mentions across 19 lessons) but valuable when present.
export type RecentDrill = {
  drill_id: number;
  name: string;
  category: string | null;
  description: string | null;
  last_mentioned_at: string | null;
  video_id: number;
  start_seconds: number;
};

export function listRecentDrills(
  lessonCount: number = 12,
  limit: number = 6,
): RecentDrill[] {
  return getDb()
    .prepare(
      `WITH recent AS (
         SELECT id FROM videos
         WHERE status IN ('analyzed','embedded')
         ORDER BY recorded_at DESC LIMIT ?
       ),
       latest_per_drill AS (
         SELECT d.id AS drill_id, d.name, d.category, d.description,
                MAX(v.recorded_at) AS last_mentioned_at,
                MAX(dm.id) AS last_mention_id
         FROM drill_mentions dm
         JOIN drills d ON d.id = dm.drill_id
         JOIN videos v ON v.id = dm.video_id
         WHERE dm.video_id IN (SELECT id FROM recent)
         GROUP BY d.id
       )
       SELECT l.drill_id, l.name, l.category, l.description, l.last_mentioned_at,
              dm.video_id, dm.start_seconds
       FROM latest_per_drill l
       JOIN drill_mentions dm ON dm.id = l.last_mention_id
       ORDER BY l.last_mentioned_at DESC
       LIMIT ?`,
    )
    .all(lessonCount, limit) as RecentDrill[];
}
