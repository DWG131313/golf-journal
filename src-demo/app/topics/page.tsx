import { listTopicsWithMentionCounts } from "@/lib/db";

// Category display order (uncategorized last)
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

  // Group by category
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

  // Total counts for the masthead
  const totalMentions = topics.reduce((s, t) => s + t.mention_count, 0);
  const totalLessons = new Set(
    topics.flatMap(() => []), // placeholder
  ).size;
  void totalLessons;

  // Mention-count scale for typographic emphasis within each category
  const maxMentions = Math.max(...topics.map((t) => t.mention_count), 1);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-12 md:pt-20">
      {/* Masthead */}
      <header className="border-b border-stone-900 pb-10">
        <p className="small-caps text-xs text-stone-500">Concepts your coaches have taught</p>
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
                  {g.topics.length} {g.topics.length === 1 ? "topic" : "topics"}
                </span>
              </header>
              <div className="mt-6 flex flex-wrap items-baseline gap-x-7 gap-y-3">
                {g.topics.map((t) => {
                  // Typographic emphasis: larger for more-mentioned topics
                  const ratio = t.mention_count / maxMentions;
                  const scale = 0.95 + ratio * 0.95; // 0.95rem → 1.9rem
                  return (
                    <a
                      key={t.topic_id}
                      href={`/topics/${t.topic_id}`}
                      className="group inline-flex items-baseline gap-1.5 font-serif italic leading-tight text-stone-300 transition-colors hover:text-moss-300"
                      style={{ fontSize: `${scale}rem` }}
                    >
                      <span>{t.name}</span>
                      <span className="font-sans text-[10px] not-italic tabular-nums text-stone-600 group-hover:text-stone-400">
                        {t.mention_count}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
