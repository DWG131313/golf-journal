"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Video,
  Transcript,
  Segment,
  TopicMentionRow,
  DrillMentionRow,
} from "@/lib/db";

function formatTimestamp(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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
  const videoSrc = `/video/${encodeURIComponent(video.filename)}`;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || initialTime <= 0) return;

    // Seek only — don't autoplay. Browser autoplay policy blocks programmatic
    // play() outside a user gesture and can leave the element stuck.
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

  function seekTo(s: number | null) {
    if (s == null || !videoRef.current) return;
    const v = videoRef.current;
    v.currentTime = s;
    // Click is a user gesture, so play() should work here.
    v.play().catch(() => {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <a href="/" className="text-sm text-zinc-500 hover:text-zinc-200">
          ← All lessons
        </a>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold">
            Lesson · {formatDate(video.recorded_at)}
          </h1>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
            {video.status}
          </span>
          {video.duration_seconds != null && (
            <span className="text-sm text-zinc-500">
              {formatTimestamp(video.duration_seconds)}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-zinc-500">{video.filename}</p>
      </header>

      <video
        ref={videoRef}
        src={videoSrc}
        controls
        preload="metadata"
        className="w-full rounded-lg border border-zinc-800 bg-black"
      />

      {segments.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Segments ({segments.length})
          </h2>
          <ol className="space-y-2">
            {segments.map((s) => {
              const points = s.key_points_json
                ? (JSON.parse(s.key_points_json) as string[])
                : [];
              return (
                <li
                  key={s.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
                >
                  <div className="flex flex-wrap items-baseline gap-3">
                    <button
                      onClick={() => seekTo(s.start_seconds)}
                      className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-200 hover:bg-zinc-700"
                    >
                      {formatTimestamp(s.start_seconds)}
                    </button>
                    <h3 className="font-medium text-zinc-100">{s.title}</h3>
                    {s.dominant_speaker && (
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                        {s.dominant_speaker}
                      </span>
                    )}
                  </div>
                  {s.summary && (
                    <p className="mt-2 text-sm text-zinc-300">{s.summary}</p>
                  )}
                  {points.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                      {points.map((p, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-zinc-600">·</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {topicMentions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Topics ({topicMentions.length})
          </h2>
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
            {topicMentions.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-baseline gap-3">
                  <button
                    onClick={() => seekTo(m.start_seconds)}
                    className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-200 hover:bg-zinc-700"
                  >
                    {formatTimestamp(m.start_seconds)}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-100">
                        {m.topic_name}
                      </span>
                      {m.topic_category && (
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                          {m.topic_category}
                        </span>
                      )}
                      {m.speaker && (
                        <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                          · {m.speaker}
                        </span>
                      )}
                    </div>
                    {m.quote && (
                      <p className="mt-1 text-sm italic text-zinc-400">
                        &ldquo;{m.quote}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {drillMentions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Drills ({drillMentions.length})
          </h2>
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
            {drillMentions.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-baseline gap-3">
                  <button
                    onClick={() => seekTo(m.start_seconds)}
                    className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-200 hover:bg-zinc-700"
                  >
                    {formatTimestamp(m.start_seconds)}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-100">
                        {m.drill_name}
                      </span>
                      {m.drill_category && (
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                          {m.drill_category}
                        </span>
                      )}
                    </div>
                    {m.quote && (
                      <p className="mt-1 text-sm italic text-zinc-400">
                        &ldquo;{m.quote}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {transcript && (
        <section className="space-y-2">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-sm font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
          >
            {showTranscript ? "▼" : "▶"} Full transcript ({transcript.word_count} words)
          </button>
          {showTranscript && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {transcript.full_text}
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
