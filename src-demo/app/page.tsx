import {
  listAllVideos,
  getFirstSegmentForVideo,
  listPracticeThemes,
  listRecentDrills,
} from "@/lib/db";
import QuickAsk from "@/components/QuickAsk";

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
function fmtMonthShortUpper(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}
function fmtYear(s: string | null): string {
  if (!s) return "";
  return String(new Date(s).getFullYear());
}
function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtMonthDay(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtMonthYear(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
function fmtTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function distinctMonths(dates: string[]): number {
  const keys = new Set(
    dates.filter(Boolean).map((s) => {
      const d = new Date(s);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }),
  );
  return keys.size;
}

export default function HomePage() {
  const all = listAllVideos();
  const recent = all[0] ?? null;
  const recentSegment = recent ? getFirstSegmentForVideo(recent.id) : null;
  const themes = listPracticeThemes(5, 4);
  const drills = listRecentDrills(12, 6);

  const validDates = all
    .map((v) => v.recorded_at)
    .filter((s): s is string => Boolean(s));
  const earliest =
    validDates.length > 0
      ? new Date(Math.min(...validDates.map((s) => new Date(s).getTime())))
      : null;
  const latest =
    validDates.length > 0
      ? new Date(Math.max(...validDates.map((s) => new Date(s).getTime())))
      : null;

  const monthsCount = distinctMonths(validDates);
  const totalSegments = all.reduce((s, v) => s + v.segment_count, 0);
  const totalTopicMentions = all.reduce((s, v) => s + v.topic_count, 0);

  return (
    <main className="mx-auto max-w-4xl px-6 pb-28 pt-10 md:pt-14">
      {/* MASTHEAD — proportional, not dominant ------------------------ */}
      <header>
        <p className="small-caps text-xs text-stone-500">A personal coaching archive</p>
        <h1 className="mt-3 font-serif text-5xl leading-[0.95] tracking-tight text-stone-100 md:text-6xl">
          Golf Journal.
        </h1>
        {earliest && latest && (
          <p className="mt-4 font-serif text-lg italic text-stone-400 md:text-xl">
            {earliest.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            {" — "}
            {latest.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        )}
      </header>

      {/* QUICK ASK — primary affordance, top of page ----------------- */}
      <section className="mt-10 border-y border-stone-900 py-8">
        <p className="small-caps mb-2 text-xs text-stone-400">Search the archive</p>
        <QuickAsk />
      </section>

      {/* LATEST LESSON ------------------------------------------------ */}
      {recent && (
        <section className="mt-14">
          <div className="flex items-baseline justify-between border-b border-stone-900 pb-3">
            <p className="small-caps text-xs text-stone-400">Most recent lesson</p>
            <p className="font-mono text-xs tracking-[0.18em] text-stone-400">
              {fmtMonthYear(recent.recorded_at)}
            </p>
          </div>
          <a
            href={`/lessons/${recent.id}`}
            className="group mt-6 grid grid-cols-[auto_1fr] gap-x-8 md:gap-x-10"
          >
            <div className="pt-1">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-stone-400">
                {fmtMonthShortUpper(recent.recorded_at)}
              </p>
              <p className="mt-0.5 font-serif text-5xl leading-none text-stone-100 tabular-nums md:text-6xl">
                {fmtDay(recent.recorded_at)}
              </p>
              <p className="mt-1.5 font-mono text-xs tracking-[0.18em] text-stone-400">
                {fmtYear(recent.recorded_at)} · {fmtTime(recent.recorded_at)}
              </p>
            </div>
            <div className="self-start pt-1">
              {recentSegment?.title && (
                <h2 className="font-serif text-2xl leading-snug text-stone-100 underline decoration-moss-500 decoration-2 underline-offset-[6px] transition-colors group-hover:text-moss-300 md:text-3xl">
                  {recentSegment.title}
                </h2>
              )}
              {recentSegment?.summary && (
                <p className="mt-3 max-w-prose text-base leading-relaxed text-stone-300 md:text-lg">
                  {recentSegment.summary}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-stone-400 tabular-nums">
                <span>{recent.segment_count} segments</span>
                <span className="text-stone-800">·</span>
                <span>{recent.topic_count} topics</span>
                <span className="text-stone-800">·</span>
                <span>{fmtDuration(recent.duration_seconds)}</span>
                <span className="text-stone-800">·</span>
                <span className="small-caps text-moss-300 group-hover:text-moss-300/70">
                  Open →
                </span>
              </div>
            </div>
          </a>
        </section>
      )}

      {/* PRACTICE THEMES — ranked list with last-mentioned dates ----- */}
      {themes.length > 0 && (
        <section className="mt-14">
          <div className="flex items-baseline justify-between border-b border-stone-900 pb-3">
            <p className="small-caps text-xs text-stone-400">Practice themes</p>
            <p className="font-mono text-xs tracking-[0.18em] text-stone-400">
              FROM YOUR LAST 5 LESSONS
            </p>
          </div>
          <ul className="mt-4">
            {themes.map((t) => (
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
          <a
            href="/topics"
            className="small-caps mt-4 inline-block text-xs text-stone-400 transition-colors hover:text-stone-200"
          >
            View all themes →
          </a>
        </section>
      )}

      {/* DRILLS — actionable practice prescriptions ------------------ */}
      {drills.length > 0 && (
        <section className="mt-14">
          <div className="flex items-baseline justify-between border-b border-stone-900 pb-3">
            <p className="small-caps text-xs text-stone-400">Drills to remember</p>
            <p className="font-mono text-xs tracking-[0.18em] text-stone-400">
              FROM RECENT LESSONS
            </p>
          </div>
          <ul className="mt-4 grid gap-x-10 gap-y-3 md:grid-cols-2">
            {drills.map((d) => (
              <li key={d.drill_id}>
                <a
                  href={`/lessons/${d.video_id}?t=${Math.floor(d.start_seconds)}`}
                  className="group block border-l-2 border-moss-500/60 py-2 pl-3 transition-colors hover:bg-stone-900/30 active:bg-stone-900/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                >
                  <p className="font-serif text-lg text-stone-200 transition-colors group-hover:text-moss-300">
                    {d.name}
                  </p>
                  <div className="mt-1 flex items-baseline gap-3 text-sm text-stone-400">
                    {d.category && (
                      <span className="small-caps text-xs text-stone-400">
                        {d.category}
                      </span>
                    )}
                    <span className="font-mono tabular-nums text-stone-400">
                      {fmtMonthDay(d.last_mentioned_at)} · {fmtTimestamp(d.start_seconds)}
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* LIBRARY TEASER — gateway to the full archive ---------------- */}
      <section className="mt-16 border-t border-stone-900 pt-10">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="small-caps text-xs text-stone-400">The whole collection</p>
            <p className="mt-3 font-serif text-2xl italic leading-snug text-stone-300 md:text-3xl">
              {all.length} lessons · {monthsCount} months · {totalSegments} segments · {totalTopicMentions} topic mentions
            </p>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <a
              href="/library"
              className="group inline-flex items-baseline gap-2 whitespace-nowrap font-serif text-lg text-moss-300 transition-colors hover:text-moss-300/70"
            >
              <span>Browse the library</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
            <a
              href="/topics"
              className="small-caps text-xs text-stone-400 transition-colors hover:text-stone-200"
            >
              or by topic →
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
