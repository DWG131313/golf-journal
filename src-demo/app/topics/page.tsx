import { listTopicsWithMentionCounts, type TopicWithCount } from "@/lib/db";

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

type SubGroup = {
  label: string | null;
  topics: TopicWithCount[];
  total_mentions: number;
};

type CategoryGroup = {
  label: string;
  rank: number;
  subgroups: SubGroup[];
};

function buildGroups(topics: TopicWithCount[]): CategoryGroup[] {
  const cats = new Map<string, CategoryGroup>();
  for (const t of topics) {
    const catKey = (t.category ?? "other").toLowerCase();
    if (!cats.has(catKey)) {
      cats.set(catKey, {
        label: categoryLabel(t.category),
        rank: categoryRank(t.category),
        subgroups: [],
      });
    }
    const cat = cats.get(catKey)!;
    let sub = cat.subgroups.find((s) => s.label === t.subcategory);
    if (!sub) {
      sub = { label: t.subcategory, topics: [], total_mentions: 0 };
      cat.subgroups.push(sub);
    }
    sub.topics.push(t);
    sub.total_mentions += t.mention_count;
  }
  // Sort subgroups within each category: named groups by total mentions desc,
  // then the unlabeled "Other" bucket last.
  for (const cat of cats.values()) {
    cat.subgroups.sort((a, b) => {
      if (a.label === null && b.label !== null) return 1;
      if (b.label === null && a.label !== null) return -1;
      return b.total_mentions - a.total_mentions;
    });
  }
  return Array.from(cats.values()).sort((a, b) => a.rank - b.rank);
}

export default function TopicsPage() {
  const topics = listTopicsWithMentionCounts();
  const groups = buildGroups(topics);
  const totalMentions = topics.reduce((s, t) => s + t.mention_count, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-12 md:pt-20">
      <header className="border-b border-stone-900 pb-10">
        <p className="small-caps text-base text-stone-400">
          Concepts your coaches have taught
        </p>
        <p className="mt-6 font-serif text-3xl italic leading-tight text-stone-200 md:text-4xl">
          {topics.length} topics · {totalMentions} mentions
        </p>
      </header>

      {topics.length === 0 ? (
        <p className="mt-12 text-stone-400">
          No topics yet — run the ingest pipeline.
        </p>
      ) : (
        <div className="mt-14 space-y-16">
          {groups.map((g) => (
            <section key={g.label}>
              <header className="flex items-baseline justify-between border-b border-stone-900 pb-3">
                <h2 className="font-serif text-xl text-stone-300">{g.label}</h2>
                <span className="small-caps text-base text-stone-400 tabular-nums">
                  {g.subgroups.reduce((s, sg) => s + sg.topics.length, 0)} topics
                </span>
              </header>
              <div className="mt-4 space-y-8">
                {g.subgroups.map((sg) => (
                  <div key={sg.label ?? "__other__"}>
                    {sg.label && (
                      <h3 className="font-serif text-base italic text-stone-400">
                        {sg.label}
                      </h3>
                    )}
                    {sg.label === null && g.subgroups.length > 1 && (
                      <h3 className="small-caps text-sm text-stone-500">
                        Other
                      </h3>
                    )}
                    <ul className={sg.label || g.subgroups.length > 1 ? "mt-2" : ""}>
                      {sg.topics.map((t) => (
                        <li
                          key={t.topic_id}
                          className="border-b border-stone-900/40 last:border-0"
                        >
                          <a
                            href={`/topics/${t.topic_id}`}
                            className="group grid grid-cols-[1fr_auto_auto] items-baseline gap-5 py-3 transition-colors hover:bg-stone-900/30 active:bg-stone-900/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                          >
                            <span className="min-w-0 truncate font-serif text-lg italic text-stone-200 transition-colors group-hover:text-moss-300">
                              {t.name}
                            </span>
                            <span className="font-mono text-sm tabular-nums text-stone-300">
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
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
