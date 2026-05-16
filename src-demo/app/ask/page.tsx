"use client";

import { useState } from "react";

type Source = {
  chunk_id: number;
  video_id: number;
  filename: string;
  recorded_at: string | null;
  segment_title: string | null;
  start_seconds: number | null;
  end_seconds: number | null;
  chunk_text: string;
  distance: number;
};

type Result = {
  answer: string;
  sources: Source[];
  inputTokens: number;
  outputTokens: number;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTimestamp(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function AskPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      setResult(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Ask your coach</h1>
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-200">
            ← All lessons
          </a>
        </div>
        <p className="text-sm text-zinc-400">
          Natural-language search across your own coaching lessons. Synthesized answer with citations.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-3">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="e.g. What did my coach say about my grip?"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Answer
            </h2>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">
              {result.answer}
            </div>
          </div>

          {result.sources.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Sources ({result.sources.length})
              </h2>
              <ol className="space-y-2">
                {result.sources.map((s, i) => {
                  const t = s.start_seconds != null ? Math.floor(s.start_seconds) : 0;
                  return (
                    <li key={s.chunk_id}>
                      <a
                        href={`/lessons/${s.video_id}?t=${t}`}
                        className="block rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm hover:bg-zinc-900/80"
                      >
                        <div className="flex items-baseline gap-3">
                          <span className="text-zinc-500">[{i + 1}]</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-zinc-300">
                              <span>{formatDate(s.recorded_at)}</span>
                              <span className="text-zinc-600">·</span>
                              <span className="font-mono text-xs text-zinc-400">
                                {formatTimestamp(s.start_seconds)}
                              </span>
                              {s.segment_title && (
                                <>
                                  <span className="text-zinc-600">·</span>
                                  <span className="text-zinc-200">{s.segment_title}</span>
                                </>
                              )}
                              <span className="ml-auto text-[10px] text-zinc-500">
                                jump →
                              </span>
                            </div>
                            <p className="mt-2 text-zinc-400">{s.chunk_text}</p>
                            <p className="mt-2 text-[10px] font-mono text-zinc-600">
                              distance: {s.distance.toFixed(3)}
                            </p>
                          </div>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <div className="text-[11px] text-zinc-600">
            tokens — in: {result.inputTokens} · out: {result.outputTokens}
          </div>
        </section>
      )}
    </main>
  );
}
