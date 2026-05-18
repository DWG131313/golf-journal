import { listTopicsWithMentionCounts } from "@/lib/db";

const CATEGORY_ORDER = [
  "fundamentals",
  "mechanics",
  "mental",
  "short-game",
  "putting",
  "equipment",
];

function categoryRank(c: string | null): number {
  if (!c) return 999;
  const idx = CATEGORY_ORDER.indexOf(c.toLowerCase());
  return idx === -1 ? 998 : idx;
}

function categoryLabel(c: string | null): string {
  if (!c) return "Other";
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export default function TopicsPage() {
  const topics = listTopicsWithMentionCounts();

  const groups = new Map<
    string,
    { label: string; rank: number; topics: typeof topics }
  >();
  for (const t of topics) {
    const key = (t.category ?? "other").toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        label: categoryLabel(t.category),
        rank: categoryRank(t.category),
        topics: [],
      });
    }
    groups.get(key)!.topics.push(t);
  }
  const sortedGroups = Array.from(groups.values()).sort(
    (a, b) => a.rank - b.rank,
  );

  const totalMentions = topics.reduce((s, t) => s + t.mention_count, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-12 md:pt-20">
      <header className="border-b border-stone-900 pb-10">
        <p className="small-caps text-xs text-stone-500">
          Concepts your coaches have taught
        </p>
        <p className="mt-6 font-serif text-3xl italic leading-tight text-stone-200 md:text-4xl">
          {topics.length} topics · {totalMentions} mentions
        </p>
      </header>

      {topics.length === 0 ? (
        <p className="mt-12 text-stone-500">
          No topics yet — run the ingest pipeline.
        </p>
      ) : (
        <div className="mt-14 space-y-16">
          {sortedGroups.map((g) => (
            <section key={g.label}>
              <header className="flex items-baseline justify-between border-b border-stone-900 pb-3">
                <h2 className="font-serif text-xl text-stone-300">{g.label}</h2>
                <span className="small-caps text-[11px] text-stone-600 tabular-nums">
                  {g.topics.length}{" "}
                  {g.topics.length === 1 ? "topic" : "topics"}
                </span>
              </header>
              <ul className="mt-4">
                {g.topics.map((t) => (
                  <li
                    key={t.topic_id}
                    className="border-b border-stone-900/40 last:border-0"
                  >
                    <a
                      href={`/topics/${t.topic_id}`}
                      className="group grid grid-cols-[1fr_auto_auto] items-baseline gap-5 py-3 transition-colors hover:bg-stone-900/30 active:bg-stone-900/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                    >
                      <span className="font-serif text-lg italic text-stone-200 transition-colors group-hover:text-moss-300">
                        {t.name}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-stone-400">
                        {t.mention_count}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-moss-500 transition-colors group-hover:text-moss-300"
                      >
                        ›
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
