"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

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

const EXAMPLE_QUERIES = [
  "What did Coach say about my grip?",
  "Drills I should be practicing for tempo",
  "What's causing my outside-in swing path?",
  "Show me everything about right palm position",
  "What did my coach say in summer 2024?",
];

function fmtDate(s: string | null): string {
  if (!s) return "Unknown date";
  return new Date(s).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fmtTimestamp(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Replace inline citations like [1], [2] with superscript footnote markers.
function renderWithCitations(text: string) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = /^\[(\d+)\]$/.exec(part);
    if (m) {
      return (
        <sup
          key={i}
          className="font-serif italic text-moss-300 ml-0.5 text-[0.7em]"
        >
          {m[1]}
        </sup>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function AskPage() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFiredRef = useRef(false);

  async function runQuery(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await runQuery(query);
  }

  // Auto-fire when the page is loaded with ?q=... from the home quick-ask
  useEffect(() => {
    if (!autoFiredRef.current && initialQ) {
      autoFiredRef.current = true;
      runQuery(initialQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  function pickExample(q: string) {
    setQuery(q);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-12">
      {/* Masthead */}
      <header className="border-b border-stone-900 pb-10">
        <p className="small-caps text-xs text-stone-500">Ask your coach</p>
        <p className="mt-6 font-serif text-3xl italic leading-tight text-stone-200 md:text-4xl">
          A search across every lesson, in your coach&apos;s own words.
        </p>
      </header>

      {/* Form */}
      <form onSubmit={submit} className="mt-10 space-y-5">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="Ask anything…"
          className="w-full resize-none border-b-2 border-stone-800 bg-transparent px-1 py-3 font-serif text-xl italic text-stone-100 placeholder:text-stone-700 focus:border-moss-500 focus:outline-none"
          autoFocus
        />
        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="small-caps text-xs text-moss-300 transition-colors hover:text-moss-300/70 disabled:cursor-not-allowed disabled:text-stone-700"
          >
            {loading ? "Searching the journal…" : "Ask →"}
          </button>
          {result && (
            <span className="font-mono text-[10px] text-stone-600">
              {result.inputTokens}↓ {result.outputTokens}↑ tokens
            </span>
          )}
        </div>
      </form>

      {/* Examples */}
      {!result && !loading && (
        <section className="mt-12">
          <p className="small-caps text-[11px] text-stone-600">Try, for instance</p>
          <ul className="mt-4 space-y-2 font-serif italic text-stone-400">
            {EXAMPLE_QUERIES.map((q) => (
              <li key={q}>
                <button
                  onClick={() => pickExample(q)}
                  className="text-left transition-colors hover:text-moss-300"
                >
                  &ldquo;{q}&rdquo;
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="mt-10 border-l-2 border-red-700 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Answer */}
      {result && (
        <section className="mt-14 space-y-12">
          <article className="space-y-5">
            <p className="small-caps text-xs text-stone-500">Answer</p>
            <div className="whitespace-pre-wrap font-serif text-xl leading-relaxed text-stone-100 md:text-[1.35rem]">
              {renderWithCitations(result.answer)}
            </div>
          </article>

          {result.sources.length > 0 && (
            <aside className="border-t border-stone-900 pt-8">
              <p className="small-caps text-xs text-stone-500">Sources</p>
              <ol className="mt-5 space-y-5">
                {result.sources.map((s, i) => {
                  const t =
                    s.start_seconds != null ? Math.floor(s.start_seconds) : 0;
                  return (
                    <li key={s.chunk_id}>
                      <a
                        href={`/lessons/${s.video_id}?t=${t}`}
                        className="group block"
                      >
                        <div className="grid grid-cols-[2rem_1fr] gap-4">
                          <sup className="font-serif text-base italic text-moss-300">
                            {i + 1}
                          </sup>
                          <div>
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                              <span className="text-stone-300">
                                {fmtDate(s.recorded_at)}
                              </span>
                              <span className="text-stone-800">·</span>
                              <span className="font-mono text-stone-500 tabular-nums">
                                {fmtTimestamp(s.start_seconds)}
                              </span>
                              {s.segment_title && (
                                <>
                                  <span className="text-stone-800">·</span>
                                  <span className="font-serif italic text-stone-400">
                                    {s.segment_title}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-stone-500 transition-colors group-hover:text-stone-300">
                              {s.chunk_text}
                            </p>
                            <p className="mt-1.5 font-mono text-[10px] text-stone-700">
                              relevance {(1 - Math.min(s.distance, 2) / 2).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </aside>
          )}
        </section>
      )}
    </main>
  );
}
