import {
  listAllVideos,
  getFirstSegmentTitles,
  type VideoSummary,
} from "@/lib/db";

// -------- format helpers --------
function fmtDay(s: string | null): string {
  if (!s) return "—";
  return String(new Date(s).getDate());
}
function fmtTime(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
function trimFilename(name: string): string {
  return name.replace(/\.(mp4|mov|m4v|avi|mkv)$/i, "").slice(0, 64);
}

type MonthGroup = { key: string; label: string; lessons: VideoSummary[] };

function groupByMonth(videos: VideoSummary[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const v of videos) {
    if (!v.recorded_at) continue;
    const d = new Date(v.recorded_at);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    if (!groups.has(key)) groups.set(key, { key, label, lessons: [] });
    groups.get(key)!.lessons.push(v);
  }
  return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const yearFilter = sp.year ? Number(sp.year) : null;

  const all = listAllVideos();
  const titles = getFirstSegmentTitles(all.map((v) => v.id));

  // Distinct years available in the data, sorted ascending
  const years = Array.from(
    new Set(
      all
        .map((v) => v.recorded_at)
        .filter((s): s is string => Boolean(s))
        .map((s) => new Date(s).getFullYear()),
    ),
  ).sort();

  const filtered = yearFilter
    ? all.filter(
        (v) => v.recorded_at && new Date(v.recorded_at).getFullYear() === yearFilter,
      )
    : all;

  const groups = groupByMonth(filtered);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-28 pt-12 md:pt-20">
      {/* Masthead */}
      <header className="border-b border-stone-900 pb-8">
        <div className="flex items-baseline justify-between">
          <p className="small-caps text-xs text-stone-500">The full archive</p>
          <a
            href="/topics"
            className="small-caps text-[11px] text-stone-500 transition-colors hover:text-stone-200"
          >
            or browse by topic →
          </a>
        </div>
        <h1 className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight text-stone-100 md:text-6xl">
          Library.
        </h1>
        <p className="mt-4 font-serif text-lg italic text-stone-400">
          {all.length} lessons across {groupByMonth(all).length} months.
        </p>
      </header>

      {/* Year filter chips */}
      <div className="mt-10 flex flex-wrap items-baseline gap-x-7 gap-y-2">
        <span className="small-caps text-[11px] text-stone-600">Filter</span>
        <a
          href="/library"
          className={`small-caps text-xs transition-colors ${
            yearFilter == null
              ? "text-moss-300"
              : "text-stone-500 hover:text-stone-200"
          }`}
        >
          All years
        </a>
        {years.map((y) => (
          <a
            key={y}
            href={`/library?year=${y}`}
            className={`font-mono text-sm tabular-nums transition-colors ${
              y === yearFilter
                ? "text-moss-300"
                : "text-stone-500 hover:text-stone-200"
            }`}
          >
            {y}
          </a>
        ))}
        <span className="ml-auto font-mono text-[10px] tabular-nums text-stone-600">
          {filtered.length} shown
        </span>
      </div>

      {/* Grouped lessons */}
      <section className="mt-12 space-y-16">
        {groups.length === 0 ? (
          <p className="text-stone-500">
            No lessons in {yearFilter ?? "this archive"} yet.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <header className="flex items-baseline justify-between border-b border-stone-900 pb-3">
                <h3 className="font-serif text-2xl text-stone-200">{g.label}</h3>
                <span className="small-caps text-[11px] text-stone-600 tabular-nums">
                  {g.lessons.length} {g.lessons.length === 1 ? "lesson" : "lessons"}
                </span>
              </header>
              <ul>
                {g.lessons.map((v) => (
                  <li
                    key={v.id}
                    className="border-b border-stone-900/40 last:border-0"
                  >
                    <a
                      href={`/lessons/${v.id}`}
                      className="group -mx-3 grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-6 rounded px-3 py-5 transition-colors hover:bg-stone-900/40"
                    >
                      <div className="font-serif text-3xl leading-none text-stone-300 tabular-nums transition-colors group-hover:text-stone-100">
                        {fmtDay(v.recorded_at)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600">
                          {fmtTime(v.recorded_at)}
                        </p>
                        <p className="mt-1.5 truncate text-base text-stone-200 transition-colors group-hover:text-moss-300">
                          {titles.get(v.id) || trimFilename(v.filename)}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-3 text-xs text-stone-600 tabular-nums">
                        <span>{v.segment_count} seg</span>
                        <span className="text-stone-800">·</span>
                        <span>{v.topic_count} topics</span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
