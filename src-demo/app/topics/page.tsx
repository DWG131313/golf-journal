import { listTopicsWithMentionCounts } from "@/lib/db";

export default function TopicsPage() {
  const topics = listTopicsWithMentionCounts();

  // Count distinct lessons across all topics (for subtitle)
  const totalLessons = new Set(
    topics.flatMap(() => []),
  ).size;
  void totalLessons; // computed per-topic instead; use topics.length for topic count

  return (
    <main className="space-y-10">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-3xl font-semibold">Topics</h1>
          <a href="/" className="text-sm text-zinc-400 hover:text-zinc-100">
            ← All lessons
          </a>
        </div>
        <p className="text-zinc-400">
          {topics.length} topics across your coaching knowledge base
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          All Topics
        </h2>
        {topics.length === 0 ? (
          <p className="text-zinc-500">No topics yet — run the ingest pipeline.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
            {topics.map((t) => (
              <li key={t.topic_id}>
                <a
                  href={`/topics/${t.topic_id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-900/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">
                        {t.name}
                      </span>
                      {t.category && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                          {t.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-6 text-sm tabular-nums text-zinc-400">
                    <span title="total mentions">{t.mention_count} mention{t.mention_count !== 1 ? "s" : ""}</span>
                    <span title="lessons">{t.lesson_count} lesson{t.lesson_count !== 1 ? "s" : ""}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
