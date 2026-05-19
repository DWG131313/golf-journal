import {
  listAllSessions,
  listRecordingsForSessions,
  type SessionSummary,
  type Recording,
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

type MonthGroup = { key: string; label: string; lessons: SessionSummary[] };

function groupByMonth(sessions: SessionSummary[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const s of sessions) {
    const ref = s.earliest_recorded_at ?? s.date;
    if (!ref) continue;
    const d = new Date(ref);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    if (!groups.has(key)) groups.set(key, { key, label, lessons: [] });
    groups.get(key)!.lessons.push(s);
  }
  return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const yearParam = sp.year ? Number(sp.year) : null;
  const yearFilter =
    yearParam !== null && Number.isFinite(yearParam) ? yearParam : null;

  const all = listAllSessions();
  const allRecordings = listRecordingsForSessions(all.map((s) => s.id));
  const recordingsBySession = new Map<number, Recording[]>();
  for (const r of allRecordings) {
    if (!recordingsBySession.has(r.session_id)) {
      recordingsBySession.set(r.session_id, []);
    }
    recordingsBySession.get(r.session_id)!.push(r);
  }

  // Distinct years available in the data, sorted ascending
  const years = Array.from(
    new Set(
      all
        .map((s) => s.earliest_recorded_at ?? s.date)
        .filter((s): s is string => Boolean(s))
        .map((s) => new Date(s).getFullYear()),
    ),
  ).sort();

  const filtered = yearFilter
    ? all.filter((s) => {
        const ref = s.earliest_recorded_at ?? s.date;
        return ref && new Date(ref).getFullYear() === yearFilter;
      })
    : all;

  const groups = groupByMonth(filtered);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-28 pt-12 md:pt-20">
      {/* Masthead */}
      <header className="border-b border-stone-900 pb-8">
        <div className="flex items-baseline justify-between">
          <p className="small-caps text-base text-stone-400">The full archive</p>
          <a
            href="/topics"
            className="small-caps text-base text-stone-400 transition-colors hover:text-stone-200"
          >
            or browse by topic →
          </a>
        </div>
        <h1 className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight text-stone-100 md:text-6xl">
          Library.
        </h1>
        <p className="mt-4 font-serif text-lg italic text-stone-300">
          {all.length} lessons across {groupByMonth(all).length} months.
        </p>
      </header>

      {/* Year filter chips */}
      <div className="mt-10 flex flex-wrap items-baseline gap-x-7 gap-y-2">
        <span className="small-caps text-base text-stone-400">Filter</span>
        <a
          href="/library"
          className={`small-caps text-base transition-colors ${
            yearFilter == null
              ? "text-moss-300"
              : "text-stone-400 hover:text-stone-200"
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
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            {y}
          </a>
        ))}
        <span className="ml-auto font-mono text-sm tabular-nums text-stone-400">
          {filtered.length} shown
        </span>
      </div>

      {/* Grouped lessons */}
      <section className="mt-12 space-y-16">
        {groups.length === 0 ? (
          <div>
            <p className="text-stone-400">
              No lessons in {yearFilter ?? "this archive"} yet.
            </p>
            {yearFilter != null && (
              <a
                href="/library"
                className="small-caps mt-3 inline-block text-base text-moss-300 transition-colors hover:text-moss-300/70"
              >
                <span aria-hidden="true">→</span> View all years
              </a>
            )}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <header className="flex items-baseline justify-between border-b border-stone-900 pb-3">
                <h3 className="font-serif text-2xl italic text-stone-200">{g.label}</h3>
                <span className="small-caps text-base text-stone-400 tabular-nums">
                  {g.lessons.length} {g.lessons.length === 1 ? "lesson" : "lessons"}
                </span>
              </header>
              <ul className="divide-y divide-stone-900/40">
                {g.lessons.map((session) => {
                  const ref = session.earliest_recorded_at ?? session.date;
                  const recordings = recordingsBySession.get(session.id) ?? [];
                  return (
                    <li key={session.id} className="py-4">
                      <div className="grid grid-cols-[3.5rem_1fr] gap-6">
                        {/* Date number — anchors the session, shown once */}
                        <div className="shrink-0 pt-1 font-serif text-3xl leading-none text-stone-300 tabular-nums">
                          {fmtDay(ref)}
                        </div>
                        {/* List of recordings under this date */}
                        <div className="min-w-0">
                          <ul className="space-y-1">
                            {recordings.map((rec) => (
                              <li key={rec.video_id}>
                                <a
                                  href={`/lessons/${session.id}?v=${rec.video_id}`}
                                  className="group -mx-3 grid grid-cols-[1fr_auto] items-baseline gap-6 rounded px-3 py-3 transition-colors hover:bg-stone-900/40 active:bg-stone-900/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                                >
                                  <div className="min-w-0">
                                    <p className="font-mono text-sm uppercase tracking-[0.22em] text-stone-400">
                                      {fmtTime(rec.recorded_at)}
                                    </p>
                                    <p className="mt-1.5 truncate text-base text-stone-200 transition-colors group-hover:text-moss-300">
                                      {rec.headline ?? trimFilename(rec.filename)}
                                    </p>
                                  </div>
                                  <div className="flex items-baseline gap-3 text-sm text-stone-400 tabular-nums">
                                    <span>{rec.segment_count} seg</span>
                                    <span className="text-stone-800" aria-hidden="true">·</span>
                                    <span>{rec.topic_count} topics</span>
                                  </div>
                                </a>
                              </li>
                            ))}
                          </ul>
                          {/* Session aggregate footer — only when there's more than one recording */}
                          {recordings.length > 1 && (
                            <p className="mt-2 pl-3 font-mono text-xs uppercase tracking-[0.18em] text-stone-500 tabular-nums">
                              {session.recording_count} recordings · {session.segment_count} segments · {session.topic_count} topics
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
