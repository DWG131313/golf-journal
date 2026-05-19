"use client";

import { useCallback, useRef, useState } from "react";

// ── Stage definitions ────────────────────────────────────────────────────────

type StageKey = "uploading" | "triaging" | "transcribing" | "analyzing" | "embedding";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "uploading",    label: "Uploading"    },
  { key: "triaging",     label: "Triaging"     },
  { key: "transcribing", label: "Transcribing" },
  { key: "analyzing",    label: "Analyzing"    },
  { key: "embedding",    label: "Embedding"    },
];

// ── State machine ────────────────────────────────────────────────────────────

type Phase =
  | { kind: "idle" }
  | { kind: "running"; currentStage: StageKey; stageStartMs: Record<string, number>; stageEndMs: Record<string, number>; logs: string[] }
  | { kind: "done"; sessionId: number; videoId: number; elapsed: number }
  | { kind: "skipped"; reason: string }
  | { kind: "error"; message: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${(s % 60).toFixed(0)}s`;
}

function stageIndexOf(key: StageKey): number {
  return STAGES.findIndex((s) => s.key === key);
}

// ── SSE event types coming from the API ─────────────────────────────────────

type SseEvent =
  | { type: "stage"; stage: StageKey }
  | { type: "log"; line: string }
  | { type: "done"; session_id: number; video_id: number }
  | { type: "skipped"; reason: string }
  | { type: "error"; message: string };

// ── Drop-zone component ──────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFile(files[0]);
    },
    [onFile],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Drop a video file or click to choose"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        "cursor-pointer rounded-sm border-2 border-dashed py-24 text-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950",
        dragOver
          ? "border-moss-500 bg-moss-500/[0.04]"
          : "border-stone-800 hover:border-stone-700",
      ].join(" ")}
    >
      <p className="font-serif italic text-stone-400 text-lg">
        Drop a .mp4 or .mov here, or click to choose
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.mov,video/mp4,video/quicktime"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

// ── Progress display ─────────────────────────────────────────────────────────

function ProgressDisplay({
  phase,
}: {
  phase: Extract<Phase, { kind: "running" }>;
}) {
  const now = Date.now();
  const currentIdx = stageIndexOf(phase.currentStage);

  return (
    <div className="space-y-6">
      <ol className="space-y-3">
        {STAGES.map(({ key, label }, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          const pending = idx > currentIdx;
          const startMs = phase.stageStartMs[key];
          const endMs = phase.stageEndMs[key];

          let elapsed: string | null = null;
          if (done && startMs && endMs) {
            elapsed = fmtElapsed(endMs - startMs);
          } else if (active && startMs) {
            elapsed = fmtElapsed(now - startMs);
          }

          return (
            <li key={key} className="flex items-baseline gap-4">
              <span
                className={[
                  "small-caps text-base w-32 shrink-0",
                  active ? "text-moss-300" : done ? "text-stone-400" : "text-stone-700",
                ].join(" ")}
              >
                {label}
                {done && " ✓"}
              </span>
              {elapsed && (
                <span
                  className={[
                    "font-mono text-sm tabular-nums",
                    active ? "text-stone-300" : "text-stone-500",
                  ].join(" ")}
                >
                  {elapsed}
                </span>
              )}
              {pending && (
                <span className="font-mono text-sm text-stone-700">—</span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Latest log lines */}
      {phase.logs.length > 0 && (
        <div className="border-l border-stone-800 pl-4 space-y-1">
          {phase.logs.slice(-4).map((line, i) => (
            <p key={i} className="font-mono text-xs text-stone-500 leading-relaxed">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Track stage start/end times across SSE updates
  const stageStartRef = useRef<Record<string, number>>({});
  const stageEndRef = useRef<Record<string, number>>({});
  const startTimeRef = useRef<number>(0);

  const handleFile = useCallback(async (file: File) => {
    // Client-side pre-validation (server re-validates)
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["mp4", "mov"].includes(ext)) {
      setPhase({ kind: "error", message: `Unsupported file type: .${ext}. Only .mp4 and .mov are accepted.` });
      return;
    }
    if (file.size > 1_073_741_824) {
      setPhase({ kind: "error", message: "File is over 1 GB. Please trim it before uploading." });
      return;
    }

    startTimeRef.current = Date.now();
    stageStartRef.current = { uploading: Date.now() };
    stageEndRef.current = {};

    setPhase({
      kind: "running",
      currentStage: "uploading",
      stageStartMs: { uploading: Date.now() },
      stageEndMs: {},
      logs: [],
    });

    const formData = new FormData();
    formData.append("file", file);

    let response: Response;
    try {
      response = await fetch("/api/upload", { method: "POST", body: formData });
    } catch (e: unknown) {
      setPhase({ kind: "error", message: `Network error: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }

    if (!response.ok || !response.body) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const j = await response.json();
        errMsg = j.error ?? errMsg;
      } catch { /* ignore */ }
      setPhase({ kind: "error", message: errMsg });
      return;
    }

    // Move to triaging immediately after the HTTP response comes back
    // (file was fully streamed to the server)
    const now = Date.now();
    stageEndRef.current["uploading"] = now;
    stageStartRef.current["triaging"] = now;

    setPhase({
      kind: "running",
      currentStage: "triaging",
      stageStartMs: { ...stageStartRef.current },
      stageEndMs: { ...stageEndRef.current },
      logs: [],
    });

    // Stream SSE events
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const applyEvent = (ev: SseEvent) => {
      const nowMs = Date.now();
      if (ev.type === "stage") {
        // Close out the previous stage
        setPhase((prev) => {
          if (prev.kind !== "running") return prev;
          const prevKey = prev.currentStage;
          stageEndRef.current[prevKey] = nowMs;
          stageStartRef.current[ev.stage] = nowMs;
          return {
            ...prev,
            currentStage: ev.stage,
            stageStartMs: { ...stageStartRef.current },
            stageEndMs: { ...stageEndRef.current },
          };
        });
      } else if (ev.type === "log") {
        setPhase((prev) => {
          if (prev.kind !== "running") return prev;
          const logs = [...prev.logs, ev.line].slice(-20);
          return { ...prev, stageStartMs: { ...stageStartRef.current }, stageEndMs: { ...stageEndRef.current }, logs };
        });
      } else if (ev.type === "done") {
        setPhase({
          kind: "done",
          sessionId: ev.session_id,
          videoId: ev.video_id,
          elapsed: nowMs - startTimeRef.current,
        });
      } else if (ev.type === "skipped") {
        setPhase({ kind: "skipped", reason: ev.reason });
      } else if (ev.type === "error") {
        setPhase({ kind: "error", message: ev.message });
      }
    };

    // Parse the SSE stream
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const ev = JSON.parse(line.slice(6)) as SseEvent;
              applyEvent(ev);
            } catch { /* malformed line */ }
          }
        }
      }
    } catch (e: unknown) {
      setPhase({ kind: "error", message: `Stream error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, []);

  const reset = () => {
    stageStartRef.current = {};
    stageEndRef.current = {};
    setPhase({ kind: "idle" });
  };

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-10">
      {/* Editorial header */}
      <header className="border-b border-stone-900 pb-8">
        <p className="small-caps text-base text-stone-400">Upload a lesson</p>
        <p className="mt-4 font-serif italic text-3xl leading-tight text-stone-200 md:text-4xl">
          Drop a coaching video here
        </p>
      </header>

      <div className="mt-10">
        {/* Idle — show drop zone */}
        {phase.kind === "idle" && <DropZone onFile={handleFile} />}

        {/* Running — show progress */}
        {phase.kind === "running" && <ProgressDisplay phase={phase} />}

        {/* Done */}
        {phase.kind === "done" && (
          <div className="space-y-6">
            <p className="small-caps text-base text-moss-300">Done</p>
            <p className="font-serif italic text-3xl leading-tight text-stone-200">
              Your lesson is ready.
            </p>
            <p className="font-mono text-sm text-stone-400 tabular-nums">
              Total time: {fmtElapsed(phase.elapsed)}
            </p>
            <a
              href={`/lessons/${phase.sessionId}?v=${phase.videoId}`}
              className="inline-block small-caps text-base text-moss-300 transition-colors hover:text-moss-300/70"
            >
              → Open the lesson
            </a>
            <div className="mt-6">
              <button
                onClick={reset}
                className="small-caps text-sm text-stone-500 transition-colors hover:text-stone-300"
              >
                Upload another
              </button>
            </div>
          </div>
        )}

        {/* Skipped */}
        {phase.kind === "skipped" && (
          <div className="space-y-4">
            <p className="small-caps text-base text-stone-400">Skipped</p>
            <p className="font-serif italic text-xl text-stone-300">
              This looks like a silent swing clip, not a coaching session.
            </p>
            <p className="text-sm text-stone-400">{phase.reason}</p>
            <button
              onClick={reset}
              className="small-caps text-base text-moss-300 transition-colors hover:text-moss-300/70"
            >
              Try a different file
            </button>
          </div>
        )}

        {/* Error */}
        {phase.kind === "error" && (
          <div className="space-y-4">
            <div className="border-l-2 border-red-800 bg-red-950/20 px-4 py-3">
              <p className="small-caps text-sm text-red-400">Error</p>
              <p className="mt-1 text-sm text-red-200">{phase.message}</p>
            </div>
            <button
              onClick={reset}
              className="small-caps text-base text-moss-300 transition-colors hover:text-moss-300/70"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
