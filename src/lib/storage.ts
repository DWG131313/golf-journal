import {
  getDb,
  type LessonRow,
  type SegmentRow,
  type ChunkRow,
  type ProcessingLogRow,
} from "./db";

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
    sourceMetadata: row.source_metadata
      ? JSON.parse(row.source_metadata)
      : null,
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
  const rows = db
    .prepare("SELECT * FROM lessons ORDER BY date DESC")
    .all() as LessonRow[];
  return rows.map(rowToLesson);
}

export function getLesson(id: string): Lesson | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM lessons WHERE id = ?")
    .get(id) as LessonRow | undefined;
  return row ? rowToLesson(row) : null;
}

export function getSegments(lessonId: string): Segment[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM segments WHERE lesson_id = ? ORDER BY segment_index"
    )
    .all(lessonId) as SegmentRow[];
  return rows.map(rowToSegment);
}

export function getSegment(
  lessonId: string,
  segmentIndex: number
): Segment | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM segments WHERE lesson_id = ? AND segment_index = ?"
    )
    .get(lessonId, segmentIndex) as SegmentRow | undefined;
  return row ? rowToSegment(row) : null;
}

export function getAllCategories(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT DISTINCT categories FROM segments")
    .all() as { categories: string }[];
  const categorySet = new Set<string>();
  for (const row of rows) {
    const cats: string[] = JSON.parse(row.categories);
    cats.forEach((c) => categorySet.add(c));
  }
  return Array.from(categorySet).sort();
}

export function getSegmentsByCategory(category: string): Segment[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM segments WHERE categories LIKE ? ORDER BY lesson_id, segment_index"
    )
    .all(`%"${category}"%`) as SegmentRow[];
  return rows.map(rowToSegment);
}

export function searchSegments(query: string): Segment[] {
  const db = getDb();
  const pattern = `%${query}%`;
  const rows = db
    .prepare(
      `SELECT * FROM segments
       WHERE transcript LIKE ? OR summary LIKE ? OR topic LIKE ? OR coach_tips LIKE ?
       ORDER BY lesson_id, segment_index`
    )
    .all(pattern, pattern, pattern, pattern) as SegmentRow[];
  return rows.map(rowToSegment);
}

export function getChunksWithEmbeddings(): Chunk[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM chunks WHERE embedding IS NOT NULL")
    .all() as ChunkRow[];
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

export function getProcessingLogs(
  lessonId?: string
): {
  lessonId: string;
  stage: string;
  tokensUsed: number;
  timestamp: string;
  status: string;
  details: string | null;
}[] {
  const db = getDb();
  const query = lessonId
    ? "SELECT * FROM processing_log WHERE lesson_id = ? ORDER BY timestamp"
    : "SELECT * FROM processing_log ORDER BY timestamp DESC";
  const rows = (
    lessonId ? db.prepare(query).all(lessonId) : db.prepare(query).all()
  ) as ProcessingLogRow[];
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
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(tokens_used), 0) as total FROM processing_log"
    )
    .get() as { total: number };
  return row.total;
}
