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
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-10">
      <a
        href="/topics"
        className="small-caps text-xs text-stone-500 transition-colors hover:text-stone-200"
      >
        ← All topics
      </a>

      {/* Topic masthead */}
      <header className="mt-8 border-b border-stone-900 pb-10">
        {topic.category && (
          <p className="small-caps text-xs text-stone-500">{topic.category}</p>
        )}
        <h1 className="mt-3 font-serif text-5xl leading-tight text-stone-100 md:text-6xl">
          {topic.name}
        </h1>
        <p className="mt-5 font-serif text-lg italic text-stone-400">
          {mentions.length} mention{mentions.length !== 1 ? "s" : ""} across{" "}
          {groups.length} lesson{groups.length !== 1 ? "s" : ""}
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="mt-12 text-stone-500">No mentions recorded for this topic.</p>
      ) : (
        <section className="mt-12 space-y-12">
          {groups.map((g) => (
            <article key={g.video_id} className="grid grid-cols-[auto_1fr] gap-x-8">
              {/* Date display */}
              <a
                href={`/lessons/${g.video_id}`}
                className="group block pt-1"
                title="Open lesson"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
                  {fmtMonthUpper(g.recorded_at)}
                </p>
                <p className="mt-1 font-serif text-5xl leading-none text-stone-200 tabular-nums transition-colors group-hover:text-moss-300">
                  {fmtDayNum(g.recorded_at)}
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-stone-700">
                  {fmtYear(g.recorded_at)}
                </p>
              </a>

              {/* Mentions in this lesson */}
              <ol className="space-y-5 border-l border-stone-900 pl-6">
                {g.mentions.map((m, i) => (
                  <li key={i}>
                    <a
                      href={`/lessons/${m.video_id}?t=${Math.floor(m.start_seconds)}`}
                      className="group block"
                    >
                      <div className="flex items-baseline gap-3 text-xs">
                        <span className="font-mono tabular-nums text-stone-500 transition-colors group-hover:text-moss-300">
                          {fmtTimestamp(m.start_seconds)}
                        </span>
                        {m.segment_title && (
                          <span className="font-serif italic text-stone-400">
                            {m.segment_title}
                          </span>
                        )}
                        {m.speaker && (
                          <span className="small-caps text-[10px] text-stone-600">
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
      )}
    </main>
  );
}
