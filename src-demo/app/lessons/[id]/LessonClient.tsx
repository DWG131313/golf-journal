"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Video,
  Transcript,
  Segment,
  TopicMentionRow,
  DrillMentionRow,
} from "@/lib/db";

// -------- format helpers --------

function fmtTimestamp(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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

function fmtTime(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// -------- component --------

export default function LessonClient({
  video,
  transcript,
  segments,
  topicMentions,
  drillMentions,
  initialTime,
}: {
  video: Video;
  transcript: Transcript | null;
  segments: Segment[];
  topicMentions: TopicMentionRow[];
  drillMentions: DrillMentionRow[];
  initialTime: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const videoSrc = `/video/${encodeURIComponent(video.filename)}`;

  // Seek-on-mount when ?t=N is provided. No autoplay (browser policy).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || initialTime <= 0) return;
    if (v.readyState >= 1) {
      v.currentTime = initialTime;
      return;
    }
    const onLoaded = () => {
      v.currentTime = initialTime;
    };
    v.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [initialTime]);

  // Track playback for highlighting the active timeline item.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, []);

  function seekTo(s: number | null) {
    if (s == null || !videoRef.current) return;
    const v = videoRef.current;
    v.currentTime = s;
    v.play().catch(() => {});
    // Scroll to the video so the user sees what they jumped to.
    v.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Topic mentions grouped by segment_id for nesting under segments.
  const topicsBySegment = useMemo(() => {
    const map = new Map<number, TopicMentionRow[]>();
    for (const m of topicMentions) {
      if (m.segment_id == null) continue;
      if (!map.has(m.segment_id)) map.set(m.segment_id, []);
      map.get(m.segment_id)!.push(m);
    }
    return map;
  }, [topicMentions]);

  const drillsBySegment = useMemo(() => {
    const map = new Map<number, DrillMentionRow[]>();
    for (const m of drillMentions) {
      if (m.segment_id == null) continue;
      if (!map.has(m.segment_id)) map.set(m.segment_id, []);
      map.get(m.segment_id)!.push(m);
    }
    return map;
  }, [drillMentions]);

  // Pull the most-mentioned topic across the lesson — used as a small hint.
  const topTopic = useMemo(() => {
    if (topicMentions.length === 0) return null;
    const counts = new Map<string, number>();
    for (const m of topicMentions) {
      const name = m.topic_name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [topicMentions]);

  // Headline: use the first segment's title if available.
  const headline = segments[0]?.title ?? null;

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-10">
      {/* Back link */}
      <a
        href="/library"
        className="small-caps text-xs tracking-[0.18em] text-stone-400 transition-colors hover:text-stone-200"
      >
        <span aria-hidden="true" className="text-moss-500">←</span> Lessons
      </a>

      {/* Date hero */}
      <header className="mt-8 grid grid-cols-[auto_1fr] items-end gap-x-10 border-b border-stone-900 pb-10">
        <div className="min-w-[44px]">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-stone-400">
            {fmtMonthUpper(video.recorded_at)}
          </p>
          <p className="mt-1 font-serif text-5xl leading-none text-stone-100 tabular-nums md:text-7xl lg:text-8xl">
            {fmtDayNum(video.recorded_at)}
          </p>
          <p className="mt-2 font-mono text-xs tracking-[0.18em] text-stone-400">
            {fmtYear(video.recorded_at)} · {fmtTime(video.recorded_at)}
          </p>
        </div>
        <div className="min-w-0 pb-2">
          {topTopic && (
            <p className="small-caps text-xs text-stone-400">
              chiefly about {topTopic}
            </p>
          )}
          {headline && (
            <h1 className="mt-3 font-serif text-3xl leading-tight text-stone-100 md:text-4xl">
              {headline}
            </h1>
          )}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-stone-400 tabular-nums">
            <span>{fmtDuration(video.duration_seconds)}</span>
            <span className="text-stone-800" aria-hidden="true">·</span>
            <span>{segments.length} segments</span>
            <span className="text-stone-800" aria-hidden="true">·</span>
            <span>{topicMentions.length} topics</span>
            {drillMentions.length > 0 && (
              <>
                <span className="text-stone-800" aria-hidden="true">·</span>
                <span>{drillMentions.length} drills</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Video */}
      <section className="mt-10">
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          preload="metadata"
          className="w-full rounded-sm border border-stone-900 bg-black shadow-2xl shadow-black/60"
        />
      </section>

      {/* Narrative timeline */}
      {segments.length > 0 && (
        <section className="mt-16">
          <p className="small-caps text-xs text-stone-400">The lesson, in sequence</p>
          <ol className="mt-6 space-y-1">
            {segments.map((seg) => {
              const segTopics = topicsBySegment.get(seg.id) ?? [];
              const segDrills = drillsBySegment.get(seg.id) ?? [];
              const isActive =
                currentTime >= seg.start_seconds &&
                currentTime <= seg.end_seconds + 0.5;
              const keyPoints: string[] = seg.key_points_json
                ? JSON.parse(seg.key_points_json)
                : [];
              return (
                <li
                  key={seg.id}
                  className={`group relative grid grid-cols-[5rem_1fr] gap-6 rounded-sm px-3 py-6 transition-colors ${
                    isActive ? "bg-moss-500/[0.06]" : "hover:bg-stone-900/30"
                  }`}
                >
                  {/* moss-green active indicator */}
                  {isActive && (
                    <span aria-hidden="true" className="absolute left-0 top-6 bottom-6 w-[2px] bg-moss-500" />
                  )}
                  {/* Timestamp button */}
                  <div className="pt-1">
                    <button
                      onClick={() => seekTo(seg.start_seconds)}
                      className="font-mono text-sm tabular-nums text-stone-400 transition-colors hover:text-moss-300"
                      title="Jump to this moment"
                    >
                      {fmtTimestamp(seg.start_seconds)}
                    </button>
                    {seg.dominant_speaker && (
                      <p className="mt-2 small-caps text-xs text-stone-400">
                        {seg.dominant_speaker}
                      </p>
                    )}
                  </div>
                  {/* Body */}
                  <div className="min-w-0">
                    {seg.title && (
                      <h3 className="font-serif text-lg leading-snug text-stone-100">
                        {seg.title}
                      </h3>
                    )}
                    {seg.summary && (
                      <p className="mt-2 text-base leading-relaxed text-stone-300">
                        {seg.summary}
                      </p>
                    )}
                    {keyPoints.length > 0 && (
                      <ul className="mt-3 space-y-1.5 text-sm text-stone-400">
                        {keyPoints.map((p, i) => (
                          <li key={i} className="flex gap-2.5">
                            <span aria-hidden="true" className="text-moss-500">·</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* Topic + drill chips inline */}
                    {(segTopics.length > 0 || segDrills.length > 0) && (
                      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                        {segTopics.map((m) => (
                          <a
                            key={`t-${m.id}`}
                            href={`/topics/${m.topic_id}`}
                            className="font-serif italic text-sm text-stone-300 transition-colors hover:text-moss-300"
                          >
                            {m.topic_name}
                          </a>
                        ))}
                        {segDrills.map((m) => (
                          <span
                            key={`d-${m.id}`}
                            className="small-caps inline-flex max-w-full items-center gap-1 rounded bg-moss-500/10 px-1.5 py-0.5 text-xs text-moss-300 [overflow-wrap:anywhere]"
                          >
                            <span aria-hidden="true" className="shrink-0">▸</span>
                            <span className="min-w-0">{m.drill_name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Standalone topic chip cloud — for orphan mentions not nested in segments */}
      {topicMentions.filter((m) => m.segment_id == null).length > 0 && (
        <section className="mt-16">
          <p className="small-caps text-xs text-stone-400">Other topics noted</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-serif italic text-stone-300">
            {topicMentions
              .filter((m) => m.segment_id == null)
              .map((m) => (
                <a
                  key={m.id}
                  href={`/topics/${m.topic_id}`}
                  className="transition-colors hover:text-moss-300"
                >
                  {m.topic_name}
                </a>
              ))}
          </div>
        </section>
      )}

      {/* Transcript — collapsed by default */}
      {transcript && (
        <section className="mt-16 border-t border-stone-900 pt-8">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="small-caps flex items-baseline gap-2 text-xs text-stone-400 transition-colors hover:text-stone-200"
          >
            <span aria-hidden="true">{showTranscript ? "▼" : "▶"}</span>
            <span>Full transcript</span>
            <span className="font-mono text-xs text-stone-500">
              {transcript.word_count} words
            </span>
          </button>
          {showTranscript && (
            <div className="mt-5 max-w-prose font-serif text-base leading-relaxed text-stone-300">
              {transcript.full_text}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
