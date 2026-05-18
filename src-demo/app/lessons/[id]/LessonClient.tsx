"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SessionWithVideos,
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

// -------- types --------

export type VideoBlock = {
  video: Video;
  transcript: Transcript | null;
  segments: Segment[];
  topicMentions: TopicMentionRow[];
  drillMentions: DrillMentionRow[];
};

// -------- session-level component --------

export default function LessonClient({
  session,
  videoBlocks,
  initialVideoId,
  initialTime,
}: {
  session: SessionWithVideos;
  videoBlocks: VideoBlock[];
  initialVideoId: number | null;
  initialTime: number;
}) {
  const totalSegments = videoBlocks.reduce((s, b) => s + b.segments.length, 0);
  const totalTopics = videoBlocks.reduce((s, b) => s + b.topicMentions.length, 0);
  const totalDrills = videoBlocks.reduce((s, b) => s + b.drillMentions.length, 0);
  const totalDuration = videoBlocks.reduce(
    (s, b) => s + (b.video.duration_seconds ?? 0),
    0,
  );

  // Use the first recording as the header anchor (earliest recorded_at).
  const firstVideo = videoBlocks[0]?.video ?? null;
  const headline = videoBlocks[0]?.segments[0]?.title ?? null;

  // Top topic across the whole session — used as a small editorial hint.
  const topTopic = useMemo(() => {
    const counts = new Map<string, number>();
    for (const block of videoBlocks) {
      for (const m of block.topicMentions) {
        counts.set(m.topic_name, (counts.get(m.topic_name) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [videoBlocks]);

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-10">
      {/* Back link */}
      <a
        href="/library"
        className="small-caps text-base tracking-[0.18em] text-stone-400 transition-colors hover:text-stone-200"
      >
        <span aria-hidden="true" className="text-moss-500">
          ←
        </span>{" "}
        Lessons
      </a>

      {/* Session header */}
      <header className="mt-8 grid grid-cols-[auto_1fr] items-end gap-x-10 border-b border-stone-900 pb-10">
        <div className="min-w-[44px]">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-stone-400">
            {fmtMonthUpper(firstVideo?.recorded_at ?? session.date)}
          </p>
          <p className="mt-1 font-serif text-5xl leading-none text-stone-100 tabular-nums md:text-7xl lg:text-8xl">
            {fmtDayNum(firstVideo?.recorded_at ?? session.date)}
          </p>
          <p className="mt-2 font-mono text-xs tracking-[0.18em] text-stone-400">
            {fmtYear(firstVideo?.recorded_at ?? session.date)}
          </p>
        </div>
        <div className="min-w-0 pb-2">
          {topTopic && (
            <p className="small-caps text-base text-stone-400">
              chiefly about {topTopic}
            </p>
          )}
          {headline && (
            <h1 className="mt-3 font-serif text-3xl leading-tight text-stone-100 md:text-4xl">
              {headline}
            </h1>
          )}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-stone-400 tabular-nums">
            <span>{fmtDuration(totalDuration)}</span>
            <span className="text-stone-800" aria-hidden="true">
              ·
            </span>
            <span>
              {videoBlocks.length}{" "}
              {videoBlocks.length === 1 ? "recording" : "recordings"}
            </span>
            <span className="text-stone-800" aria-hidden="true">
              ·
            </span>
            <span>{totalSegments} segments</span>
            <span className="text-stone-800" aria-hidden="true">
              ·
            </span>
            <span>{totalTopics} topics</span>
            {totalDrills > 0 && (
              <>
                <span className="text-stone-800" aria-hidden="true">
                  ·
                </span>
                <span>{totalDrills} drills</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Recordings stacked vertically — each its own scrubbable block */}
      <div className="space-y-16">
        {videoBlocks.map((block, idx) => (
          <RecordingBlock
            key={block.video.id}
            block={block}
            sequence={idx + 1}
            totalRecordings={videoBlocks.length}
            autoSeek={block.video.id === initialVideoId ? initialTime : null}
          />
        ))}
      </div>
    </main>
  );
}

// -------- per-recording component --------

function RecordingBlock({
  block,
  sequence,
  totalRecordings,
  autoSeek,
}: {
  block: VideoBlock;
  sequence: number;
  totalRecordings: number;
  autoSeek: number | null;
}) {
  const { video, segments, topicMentions, drillMentions, transcript } = block;
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentTime, setCurrentTime] = useState(autoSeek ?? 0);
  const videoSrc = `/video/${encodeURIComponent(video.filename)}`;

  // If this is the target recording for a ?v=&t= deep link, seek to t
  // and scroll the recording into view once the video metadata is loaded.
  useEffect(() => {
    if (autoSeek == null) return;
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      v.currentTime = autoSeek;
    };
    if (v.readyState >= 1) {
      v.currentTime = autoSeek;
    } else {
      v.addEventListener("loadedmetadata", onLoaded, { once: true });
    }
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [autoSeek]);

  // Track playback time so the active segment gets the moss-tinted state.
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
    v.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

  const orphanTopics = topicMentions.filter((m) => m.segment_id == null);

  return (
    <div ref={sectionRef}>
      {/* Per-recording header — only shown when there are multiple recordings */}
      {totalRecordings > 1 && (
        <div className="flex items-baseline justify-between border-b border-stone-900 pb-3">
          <p className="small-caps text-base text-stone-400">
            Recording {sequence} of {totalRecordings}
          </p>
          <p className="font-mono text-sm tracking-[0.18em] text-stone-400 tabular-nums">
            {fmtTime(video.recorded_at)}
            {video.duration_seconds && (
              <>
                {" · "}
                {fmtDuration(video.duration_seconds)}
              </>
            )}
          </p>
        </div>
      )}

      {/* Video player */}
      <section className={totalRecordings > 1 ? "mt-6" : "mt-10"}>
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
        <section className="mt-10">
          <p className="small-caps text-base text-stone-400">
            {totalRecordings > 1 ? "In this recording" : "The lesson, in sequence"}
          </p>
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
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-6 bottom-6 w-[2px] bg-moss-500"
                    />
                  )}
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
                            <span aria-hidden="true" className="text-moss-500">
                              ·
                            </span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
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
                            <span aria-hidden="true" className="shrink-0">
                              ▸
                            </span>
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

      {/* Orphan topic mentions — those not nested in a segment */}
      {orphanTopics.length > 0 && (
        <section className="mt-12">
          <p className="small-caps text-base text-stone-400">Other topics noted</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-serif italic text-stone-300">
            {orphanTopics.map((m) => (
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

      {/* Transcript — collapsed by default, one toggle per recording */}
      {transcript && (
        <section className="mt-12 border-t border-stone-900 pt-8">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="small-caps flex items-baseline gap-2 text-base text-stone-400 transition-colors hover:text-stone-200"
          >
            <span aria-hidden="true">{showTranscript ? "▼" : "▶"}</span>
            <span>Full transcript</span>
            <span className="font-mono text-sm text-stone-500">
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
    </div>
  );
}
