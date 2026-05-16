import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./db";

// Must match the model used by the Python embed stage (sentence-transformers/all-MiniLM-L6-v2).
// Xenova ships ONNX-converted weights of the same model.
const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
const CLAUDE_MODEL = "claude-sonnet-4-6";

let _embedder: FeatureExtractionPipeline | null = null;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (_embedder) return _embedder;
  _embedder = (await pipeline(
    "feature-extraction",
    EMBED_MODEL,
  )) as FeatureExtractionPipeline;
  return _embedder;
}

export async function embedQuery(text: string): Promise<number[]> {
  const ext = await getEmbedder();
  const out = await ext(text, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

export type RetrievedChunk = {
  chunk_id: number;
  video_id: number;
  segment_id: number | null;
  filename: string;
  recorded_at: string | null;
  segment_title: string | null;
  segment_summary: string | null;
  start_seconds: number | null;
  end_seconds: number | null;
  chunk_text: string;
  distance: number;
};

function toBlob(vec: number[]): Buffer {
  // sqlite-vec expects raw float32 little-endian bytes
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf;
}

export function retrieveChunks(queryEmbedding: number[], k = 5): RetrievedChunk[] {
  return getDb()
    .prepare(
      `SELECT
         c.id AS chunk_id,
         c.video_id,
         c.segment_id,
         c.chunk_text,
         v.filename,
         v.recorded_at,
         s.title    AS segment_title,
         s.summary  AS segment_summary,
         s.start_seconds,
         s.end_seconds,
         cv.distance
       FROM chunks_vec cv
       JOIN chunks   c ON c.id = cv.rowid
       JOIN videos   v ON v.id = c.video_id
       LEFT JOIN segments s ON s.id = c.segment_id
       WHERE cv.embedding MATCH ? AND k = ?
       ORDER BY cv.distance`,
    )
    .all(toBlob(queryEmbedding), k) as RetrievedChunk[];
}

function formatSource(c: RetrievedChunk, n: number): string {
  const date = c.recorded_at
    ? new Date(c.recorded_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "unknown date";
  const ts =
    c.start_seconds != null
      ? `${Math.floor(c.start_seconds / 60)}:${String(
          Math.floor(c.start_seconds % 60),
        ).padStart(2, "0")}`
      : "—";
  const title = c.segment_title ? ` — ${c.segment_title}` : "";
  return `[${n}] Lesson from ${date}, ${ts}${title}\n${c.chunk_text}`;
}

export function buildSystemPrompt(chunks: RetrievedChunk[]): string {
  const sources = chunks.map((c, i) => formatSource(c, i + 1)).join("\n\n");
  return `You are Danny's personal golf coaching assistant. He's asking about his own past coaching lessons.

Use ONLY the lesson excerpts below to answer. Be specific: name the date and timestamp when you reference an excerpt. Use inline numeric citations like [1], [2], [3] that correspond to the excerpts.

If the excerpts don't contain a clear answer, say so plainly. Don't speculate or pull from general golf knowledge — Danny wants what HIS coaches said, in HIS lessons.

LESSON EXCERPTS:
${sources}`;
}

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set (expected in .env.local)");
  }
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export async function askWithRag(
  query: string,
  k = 5,
): Promise<{
  answer: string;
  sources: RetrievedChunk[];
  inputTokens: number;
  outputTokens: number;
}> {
  const embedding = await embedQuery(query);
  const sources = retrieveChunks(embedding, k);

  if (sources.length === 0) {
    return {
      answer:
        "I couldn't find anything in your lessons matching that question yet. The pipeline may still be embedding videos, or your question is on a topic your coaches haven't covered in the lessons we've processed.",
      sources: [],
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const systemPrompt = buildSystemPrompt(sources);
  const client = getAnthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: query }],
  });

  const first = response.content[0];
  const answer = first && first.type === "text" ? first.text : "";

  return {
    answer,
    sources,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
