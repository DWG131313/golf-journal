import { listAllVideos, countByStatus } from "@/lib/db";

function formatDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STATUS_ORDER = ["embedded", "analyzed", "transcribed", "classified", "pending"];

export default function HomePage() {
  const videos = listAllVideos();
  const counts = Object.fromEntries(
    countByStatus().map((c) => [c.status, c.n]),
  );

  return (
    <main className="space-y-10">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-3xl font-semibold">Golf Coach Demo</h1>
          <div className="flex items-baseline gap-4">
            <a href="/topics" className="text-sm text-zinc-400 hover:text-zinc-100">
              Topics →
            </a>
            <a href="/ask" className="text-sm text-zinc-400 hover:text-zinc-100">
              Ask your coach →
            </a>
          </div>
        </div>
        <p className="text-zinc-400">
          {videos.length} lessons ingested · personal coaching knowledge base
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
            <span
              key={s}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-300"
            >
              {s}: {counts[s]}
            </span>
          ))}
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Lessons
        </h2>
        {videos.length === 0 ? (
          <p className="text-zinc-500">No lessons yet — run the ingest pipeline.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
            {videos.map((v) => (
              <li key={v.id}>
                <a
                  href={`/lessons/${v.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-900/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">
                        {formatDate(v.recorded_at)}
                      </span>
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                        {v.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500">{v.filename}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-6 text-sm tabular-nums text-zinc-400">
                    <span title="duration">{formatDuration(v.duration_seconds)}</span>
                    <span title="topical segments">{v.segment_count} seg</span>
                    <span title="topic mentions">{v.topic_count} topics</span>
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
