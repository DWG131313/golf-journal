import { notFound } from "next/navigation";
import {
  getTopicById,
  listMentionsForTopic,
  type TopicLessonMention,
} from "@/lib/db";

function formatDate(s: string | null): string {
  if (!s) return "Unknown date";
  const d = new Date(s);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function truncateFilename(filename: string, maxLen = 60): string {
  if (filename.length <= maxLen) return filename;
  return "…" + filename.slice(-(maxLen - 1));
}

type LessonGroup = {
  video_id: number;
  filename: string;
  recorded_at: string | null;
  mentions: TopicLessonMention[];
};

function groupByLesson(mentions: TopicLessonMention[]): LessonGroup[] {
  const map = new Map<number, LessonGroup>();
  for (const m of mentions) {
    if (!map.has(m.video_id)) {
      map.set(m.video_id, {
        video_id: m.video_id,
        filename: m.filename,
        recorded_at: m.recorded_at,
        mentions: [],
      });
    }
    map.get(m.video_id)!.mentions.push(m);
  }
  // mentions are already sorted by recorded_at DESC, start_seconds ASC
  return Array.from(map.values());
}

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const topicId = Number(id);
  if (!Number.isFinite(topicId)) notFound();

  const topic = getTopicById(topicId);
  if (!topic) notFound();

  const mentions = listMentionsForTopic(topicId);
  const groups = groupByLesson(mentions);

  return (
    <main className="space-y-10">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-3xl font-semibold">{topic.name}</h1>
          <a href="/topics" className="text-sm text-zinc-400 hover:text-zinc-100">
            ← All topics
          </a>
        </div>
        <div className="flex items-center gap-3">
          {topic.category && (
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wider text-zinc-400">
              {topic.category}
            </span>
          )}
          <p className="text-zinc-400">
            {mentions.length} mention{mentions.length !== 1 ? "s" : ""} across{" "}
            {groups.length} lesson{groups.length !== 1 ? "s" : ""}
          </p>
        </div>
      </header>

      {groups.length === 0 ? (
        <p className="text-zinc-500">No mentions recorded for this topic.</p>
      ) : (
        <section className="space-y-6">
          {groups.map((g) => (
            <div
              key={g.video_id}
              className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40"
            >
              {/* Lesson group header */}
              <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-zinc-200">
                    {formatDate(g.recorded_at)}
                  </span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {truncateFilename(g.filename)}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                  {g.mentions.length} mention{g.mentions.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Mention rows */}
              <ul className="divide-y divide-zinc-800">
                {g.mentions.map((m, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-3">
                    <a
                      href={`/lessons/${m.video_id}?t=${Math.floor(m.start_seconds)}`}
                      className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                      title="Jump to this moment in the lesson"
                    >
                      {formatTimestamp(m.start_seconds)}
                    </a>
                    <div className="min-w-0 flex-1 space-y-1">
                      {m.quote && (
                        <p className="text-sm italic text-zinc-300">
                          &ldquo;{m.quote}&rdquo;
                        </p>
                      )}
                      {m.segment_title && (
                        <p className="text-xs text-zinc-500">{m.segment_title}</p>
                      )}
                    </div>
                    {m.speaker && (
                      <span className="shrink-0 text-xs text-zinc-500">
                        {m.speaker}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
