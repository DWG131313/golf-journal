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

// ----------------------------------------------------------------------
// Sessions — a lesson is a coaching session (one date), which contains
// one or more video recordings. Schema designed for this from the start;
// session_videos is the junction table with `sequence` for ordering.
// ----------------------------------------------------------------------
export type Session = {
  id: number;
  date: string;
  coach_id: number | null;
  facility: string | null;
  title: string | null;
  summary: string | null;
};

export type SessionSummary = Session & {
  recording_count: number;
  segment_count: number;
  topic_count: number;
  total_duration_seconds: number | null;
  earliest_recorded_at: string | null;
  latest_recorded_at: string | null;
};

export type SessionWithVideos = Session & {
  videos: Video[];
};

export function listAllSessions(): SessionSummary[] {
  return getDb()
    .prepare(
      `SELECT s.*,
              COUNT(DISTINCT sv.video_id) AS recording_count,
              (SELECT COUNT(*) FROM segments
                 WHERE video_id IN (SELECT video_id FROM session_videos WHERE session_id = s.id)) AS segment_count,
              (SELECT COUNT(*) FROM topic_mentions
                 WHERE video_id IN (SELECT video_id FROM session_videos WHERE session_id = s.id)) AS topic_count,
              (SELECT SUM(v.duration_seconds) FROM videos v
                 JOIN session_videos sv2 ON sv2.video_id = v.id
                 WHERE sv2.session_id = s.id) AS total_duration_seconds,
              (SELECT MIN(v.recorded_at) FROM videos v
                 JOIN session_videos sv2 ON sv2.video_id = v.id
                 WHERE sv2.session_id = s.id) AS earliest_recorded_at,
              (SELECT MAX(v.recorded_at) FROM videos v
                 JOIN session_videos sv2 ON sv2.video_id = v.id
                 WHERE sv2.session_id = s.id) AS latest_recorded_at
       FROM sessions s
       JOIN session_videos sv ON sv.session_id = s.id
       GROUP BY s.id
       ORDER BY s.date DESC`,
    )
    .all() as SessionSummary[];
}

export function getSessionById(id: number): SessionWithVideos | null {
  const session = getDb()
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as Session | undefined;
  if (!session) return null;
  const videos = getDb()
    .prepare(
      `SELECT v.*
       FROM videos v
       JOIN session_videos sv ON sv.video_id = v.id
       WHERE sv.session_id = ?
       ORDER BY sv.sequence, v.recorded_at`,
    )
    .all(id) as Video[];
  return { ...session, videos };
}

// Find which session a given video belongs to. Used when the data layer
// only knows the video_id (legacy URLs, /api/ask, etc.) and we need to
// build a session-aware URL.
export function getSessionIdForVideo(videoId: number): number | null {
  const row = getDb()
    .prepare("SELECT session_id FROM session_videos WHERE video_id = ?")
    .get(videoId) as { session_id: number } | undefined;
  return row?.session_id ?? null;
}

// First segment titles + summaries for a set of sessions. Uses the first
// video in each session (sequence=1) and its first segment by start time.
// Returns the editorial "headline" for library rows + home recent-lesson card.
export type SessionHeadline = {
  session_id: number;
  title: string | null;
  summary: string | null;
};

// Recordings (videos) within a set of sessions, each annotated with the title
// of its first segment — used as the per-recording scannable "topic of focus"
// in the library. Returns one row per video, ordered chronologically.
export type Recording = {
  session_id: number;
  video_id: number;
  filename: string;
  recorded_at: string | null;
  duration_seconds: number | null;
  segment_count: number;
  topic_count: number;
  headline: string | null;
};

export function listRecordingsForSessions(sessionIds: number[]): Recording[] {
  if (sessionIds.length === 0) return [];
  const placeholders = sessionIds.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT
         sv.session_id,
         v.id AS video_id,
         v.filename,
         v.recorded_at,
         v.duration_seconds,
         (SELECT COUNT(*) FROM segments WHERE video_id = v.id) AS segment_count,
         (SELECT COUNT(*) FROM topic_mentions WHERE video_id = v.id) AS topic_count,
         (SELECT title FROM segments WHERE video_id = v.id
            ORDER BY start_seconds LIMIT 1) AS headline
       FROM session_videos sv
       JOIN videos v ON v.id = sv.video_id
       WHERE sv.session_id IN (${placeholders})
       ORDER BY v.recorded_at, sv.sequence`,
    )
    .all(...sessionIds) as Recording[];
}

export function getFirstSegmentForSessions(
  sessionIds: number[],
): Map<number, SessionHeadline> {
  const map = new Map<number, SessionHeadline>();
  if (sessionIds.length === 0) return map;
  const placeholders = sessionIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `WITH first_video AS (
         SELECT session_id, video_id
         FROM session_videos sv
         WHERE session_id IN (${placeholders})
           AND sequence = (SELECT MIN(sequence) FROM session_videos WHERE session_id = sv.session_id)
       )
       SELECT fv.session_id, seg.title, seg.summary
       FROM first_video fv
       JOIN segments seg ON seg.video_id = fv.video_id
       WHERE seg.start_seconds = (SELECT MIN(start_seconds) FROM segments WHERE video_id = fv.video_id)`,
    )
    .all(...sessionIds) as SessionHeadline[];
  for (const r of rows) map.set(r.session_id, r);
  return map;
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
  session_id: number;
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
      `SELECT tm.*, sv.session_id, t.name AS topic_name, t.category AS topic_category
       FROM topic_mentions tm
       JOIN topics t ON t.id = tm.topic_id
       JOIN session_videos sv ON sv.video_id = tm.video_id
       WHERE tm.video_id = ?
       ORDER BY tm.start_seconds`,
    )
    .all(videoId) as TopicMentionRow[];
}

export type DrillMentionRow = {
  id: number;
  video_id: number;
  session_id: number;
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
      `SELECT dm.*, sv.session_id, d.name AS drill_name, d.category AS drill_category
       FROM drill_mentions dm
       JOIN drills d ON d.id = dm.drill_id
       JOIN session_videos sv ON sv.video_id = dm.video_id
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
  subcategory: string | null;
  mention_count: number;
  lesson_count: number;
};

export function listTopicsWithMentionCounts(): TopicWithCount[] {
  return getDb()
    .prepare(
      `SELECT t.id AS topic_id,
              t.name,
              t.category,
              t.subcategory,
              COUNT(tm.id) AS mention_count,
              COUNT(DISTINCT sv.session_id) AS lesson_count
       FROM topics t
       LEFT JOIN topic_mentions tm ON tm.topic_id = t.id
       LEFT JOIN session_videos sv ON sv.video_id = tm.video_id
       GROUP BY t.id
       ORDER BY mention_count DESC, t.name ASC`,
    )
    .all() as TopicWithCount[];
}

export type TopicLessonMention = {
  session_id: number;
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
      `SELECT sv.session_id,
              tm.video_id,
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
       JOIN session_videos sv ON sv.video_id = tm.video_id
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
      `WITH recent_sessions AS (
         SELECT id FROM sessions
         ORDER BY date DESC LIMIT ?
       ),
       recent_videos AS (
         SELECT sv.video_id
         FROM session_videos sv
         WHERE sv.session_id IN (SELECT id FROM recent_sessions)
       )
       SELECT t.id AS topic_id, t.name, t.category,
              COUNT(tm.id) AS mention_count,
              MAX(v.recorded_at) AS last_mentioned_at
       FROM topic_mentions tm
       JOIN topics t ON t.id = tm.topic_id
       JOIN videos v ON v.id = tm.video_id
       WHERE tm.video_id IN (SELECT video_id FROM recent_videos)
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
  session_id: number;
  video_id: number;
  start_seconds: number;
};

export function listRecentDrills(
  lessonCount: number = 12,
  limit: number = 6,
): RecentDrill[] {
  return getDb()
    .prepare(
      `WITH recent_sessions AS (
         SELECT id FROM sessions
         ORDER BY date DESC LIMIT ?
       ),
       recent_videos AS (
         SELECT sv.video_id, sv.session_id
         FROM session_videos sv
         WHERE sv.session_id IN (SELECT id FROM recent_sessions)
       ),
       latest_per_drill AS (
         SELECT d.id AS drill_id, d.name, d.category, d.description,
                MAX(v.recorded_at) AS last_mentioned_at,
                MAX(dm.id) AS last_mention_id
         FROM drill_mentions dm
         JOIN drills d ON d.id = dm.drill_id
         JOIN videos v ON v.id = dm.video_id
         WHERE dm.video_id IN (SELECT video_id FROM recent_videos)
         GROUP BY d.id
       )
       SELECT l.drill_id, l.name, l.category, l.description, l.last_mentioned_at,
              rv.session_id, dm.video_id, dm.start_seconds
       FROM latest_per_drill l
       JOIN drill_mentions dm ON dm.id = l.last_mention_id
       JOIN recent_videos rv ON rv.video_id = dm.video_id
       ORDER BY l.last_mentioned_at DESC
       LIMIT ?`,
    )
    .all(lessonCount, limit) as RecentDrill[];
}
