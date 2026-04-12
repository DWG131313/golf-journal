"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type SourceType = "local" | "youtube" | null;

function detectSourceType(value: string): SourceType {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.includes("youtube.com/") ||
    trimmed.includes("youtu.be/")
  ) {
    return "youtube";
  }
  if (
    trimmed.endsWith(".mov") ||
    trimmed.endsWith(".mp4") ||
    trimmed.endsWith(".m4v") ||
    trimmed.endsWith(".avi") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("~")
  ) {
    return "local";
  }
  return null;
}

function buildCommand(source: string, sourceType: SourceType): string {
  if (!source.trim() || !sourceType) return "";
  const escaped = source.trim().replace(/'/g, "'\\''");
  return `cd pipeline && source .venv/bin/activate && python -m src.cli ingest '${escaped}'`;
}

export default function NewLessonPage() {
  const [source, setSource] = useState("");
  const [copied, setCopied] = useState(false);

  const sourceType = detectSourceType(source);
  const command = buildCommand(source, sourceType);

  function handleCopy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <Link
        href="/lessons"
        className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All Lessons
      </Link>

      <h1 className="mb-6 text-2xl font-bold">Add New Lesson</h1>

      <p className="mb-4 text-sm text-muted-foreground">
        Paste a YouTube URL or a local file path to a video recording (.mov,
        .mp4). The ingestion pipeline will process it through transcription,
        keyframe extraction, and AI analysis.
      </p>

      {/* Source input */}
      <div className="mb-4">
        <label
          htmlFor="source"
          className="mb-1.5 block text-sm font-medium"
        >
          Video Source
        </label>
        <Input
          id="source"
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="https://youtube.com/watch?v=... or /path/to/lesson.mov"
        />
      </div>

      {/* Source type detection */}
      {sourceType && (
        <div className="mb-6 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Detected:</span>
          <Badge variant="outline">
            {sourceType === "youtube" ? "YouTube" : "Local File"}
          </Badge>
        </div>
      )}

      {/* CLI command */}
      {command && (
        <section className="rounded-md border bg-muted/50 p-4">
          <h2 className="mb-2 text-sm font-semibold">
            Run this in your terminal
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            The pipeline processes videos through 5 stages: acquire, audio
            extraction, transcription, keyframe extraction, and AI analysis.
          </p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 overflow-x-auto rounded bg-background p-3 text-xs">
              {command}
            </pre>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg border bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </section>
      )}

      {!source.trim() && (
        <div className="mt-8 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Enter a video source above to get started.
        </div>
      )}
    </div>
  );
}
