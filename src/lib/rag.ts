import { getDb, type ChunkRow, type SegmentRow } from "./db";

export interface RetrievedChunk {
  text: string;
  lessonId: string;
  segmentIndex: number;
  topic: string;
  startTime: number;
  endTime: number;
}

/**
 * Search chunks by text matching against the chunk text column,
 * plus the parent segment's topic, summary, and coach_tips.
 * Returns up to `limit` chunks, enriched with the segment topic.
 */
export function retrieveContext(
  query: string,
  limit = 8
): RetrievedChunk[] {
  const db = getDb();
  const pattern = `%${query}%`;

  // Join chunks with their parent segment to get topic and search across
  // multiple text fields for better recall.
  const rows = db
    .prepare(
      `SELECT c.text, c.lesson_id, c.segment_index, c.start_time, c.end_time,
              s.topic
       FROM chunks c
       JOIN segments s ON c.lesson_id = s.lesson_id
                      AND c.segment_index = s.segment_index
       WHERE c.text LIKE ?1
          OR s.topic LIKE ?1
          OR s.summary LIKE ?1
          OR s.coach_tips LIKE ?1
       GROUP BY c.id
       ORDER BY c.lesson_id, c.segment_index, c.start_time
       LIMIT ?2`
    )
    .all(pattern, limit) as (Pick<
      ChunkRow,
      "text" | "lesson_id" | "segment_index" | "start_time" | "end_time"
    > & { topic: string })[];

  return rows.map((r) => ({
    text: r.text,
    lessonId: r.lesson_id,
    segmentIndex: r.segment_index,
    topic: r.topic,
    startTime: r.start_time,
    endTime: r.end_time,
  }));
}

/** Format retrieved chunks into a context block for the system prompt. */
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  return chunks
    .map((c, i) => {
      const time = `${Math.floor(c.startTime / 60)}:${Math.floor(c.startTime % 60).toString().padStart(2, "0")}`;
      return [
        `[Source ${i + 1}: "${c.topic}" @ ${time} — /lessons/${c.lessonId}/segments/${c.segmentIndex}]`,
        c.text,
      ].join("\n");
    })
    .join("\n\n");
}

/** Build the full system prompt with RAG context injected. */
export function buildSystemPrompt(query: string): string {
  const chunks = retrieveContext(query);
  const context = formatContext(chunks);

  const base = `You are a golf coaching assistant. You help the user review and understand their golf lessons.
Answer questions based on the retrieved lesson context below. When referencing specific advice or observations, cite the source using markdown links like [Source N](/lessons/ID/segments/INDEX).
If the context doesn't contain enough information to answer, say so honestly rather than guessing.
Keep answers concise and actionable — focus on the coaching insights.`;

  if (!context) {
    return `${base}\n\nNo relevant lesson content was found for this query. Let the user know, and suggest they try different search terms or process more lesson videos.`;
  }

  return `${base}\n\n--- Retrieved Lesson Context ---\n${context}\n--- End Context ---`;
}
