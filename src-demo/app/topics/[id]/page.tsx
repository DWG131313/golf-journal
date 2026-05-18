import { notFound } from "next/navigation";
import {
  getTopicById,
  listMentionsForTopic,
  type TopicLessonMention,
} from "@/lib/db";

function fmtDayNum(s: string | null): string {
  if (!s) return "—";
  return String(new Date(s).getDate());
}

function fmtMonthUpper(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}

function fmtYear(s: string | null): string {
  if (!s) return "";
  return String(new Date(s).getFullYear());
}

function fmtTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type LessonGroup = {
  session_id: number;
  earliest_recorded_at: string | null;
  mentions: TopicLessonMention[];
};

// Group mentions by SESSION (date), not video. Multiple recordings on the same
// day that both mention the topic now appear under one date block rather than
// duplicating the date.
function groupByLesson(mentions: TopicLessonMention[]): LessonGroup[] {
  const map = new Map<number, LessonGroup>();
  for (const m of mentions) {
    if (!map.has(m.session_id)) {
      map.set(m.session_id, {
        session_id: m.session_id,
        earliest_recorded_at: m.recorded_at,
        mentions: [],
      });
    }
    const group = map.get(m.session_id)!;
    group.mentions.push(m);
    // Track the earliest recorded_at across all videos in this session for sort.
    if (
      m.recorded_at &&
      (group.earliest_recorded_at == null ||
        m.recorded_at < group.earliest_recorded_at)
    ) {
      group.earliest_recorded_at = m.recorded_at;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    (b.earliest_recorded_at ?? "").localeCompare(a.earliest_recorded_at ?? ""),
  );
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
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-10">
      <a
        href="/topics"
        className="small-caps text-base tracking-[0.18em] text-stone-400 transition-colors hover:text-stone-200"
      >
        <span aria-hidden="true" className="text-moss-500">←</span> Themes
      </a>

      {/* Topic masthead */}
      <header className="mt-8 border-b border-stone-900 pb-10">
        {topic.category && (
          <p className="small-caps text-base text-stone-400">{topic.category}</p>
        )}
        <h1 className="mt-3 font-serif text-5xl leading-tight text-stone-100 md:text-6xl">
          {topic.name}
        </h1>
        <p className="mt-5 font-mono text-sm uppercase tracking-[0.22em] text-stone-400 tabular-nums">
          {mentions.length} {mentions.length === 1 ? "mention" : "mentions"} · {groups.length} {groups.length === 1 ? "lesson" : "lessons"}
        </p>
        <hr className="mt-4 border-t border-moss-500/40" />
      </header>

      {groups.length === 0 ? (
        <p className="mt-12 text-stone-400">No mentions recorded for this topic.</p>
      ) : (
        <>
        <p className="mt-10 small-caps text-base text-stone-400">Recent mentions</p>
        <section className="mt-4 space-y-12">
          {groups.map((g) => (
            <article key={g.session_id} className="grid grid-cols-[auto_1fr] gap-x-8">
              {/* Date display */}
              <a
                href={`/lessons/${g.session_id}`}
                className="group block min-w-[44px] pt-1"
                title="Open lesson"
              >
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-stone-400">
                  {fmtMonthUpper(g.earliest_recorded_at)}
                </p>
                <p className="mt-1 font-serif text-5xl leading-none text-stone-200 tabular-nums transition-colors group-hover:text-moss-300">
                  {fmtDayNum(g.earliest_recorded_at)}
                </p>
                <p className="mt-1 font-mono text-xs tracking-[0.18em] text-stone-500">
                  {fmtYear(g.earliest_recorded_at)}
                </p>
              </a>

              {/* Mentions in this lesson */}
              <ol className="space-y-5 border-l border-stone-900 pl-6">
                {g.mentions.map((m, i) => (
                  <li key={i}>
                    <a
                      href={`/lessons/${m.session_id}?v=${m.video_id}&t=${Math.floor(m.start_seconds)}`}
                      className="group block"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-moss-500/10 px-1.5 py-0.5 font-mono text-xs tabular-nums text-moss-300 transition-colors group-hover:bg-moss-500/20">
                          <span aria-hidden="true">▶</span>
                          {fmtTimestamp(m.start_seconds)}
                        </span>
                        {m.segment_title && (
                          <span className="min-w-0 font-serif italic text-stone-300">
                            {m.segment_title}
                          </span>
                        )}
                        {m.speaker && (
                          <span className="small-caps shrink-0 text-xs text-stone-400">
                            {m.speaker}
                          </span>
                        )}
                      </div>
                      {m.quote && (
                        <p className="mt-2 font-serif italic leading-relaxed text-stone-300 transition-colors group-hover:text-stone-100">
                          &ldquo;{m.quote}&rdquo;
                        </p>
                      )}
                    </a>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </section>
        </>
      )}
    </main>
  );
}
