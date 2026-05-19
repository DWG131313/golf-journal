"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Source = {
  chunk_id: number;
  video_id: number;
  session_id: number;
  filename: string;
  recorded_at: string | null;
  segment_title: string | null;
  start_seconds: number | null;
  end_seconds: number | null;
  chunk_text: string;
  distance: number;
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
// Safe to call on partial text — half-formed tokens like "[1" just render as
// plain text until the closing "]" arrives.
function renderWithCitations(text: string) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = /^\[(\d+)\]$/.exec(part);
    if (m) {
      return (
        <sup
          key={i}
          aria-label={`Citation ${m[1]}`}
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

  // Streaming state — kept separate so each can update independently.
  const [answer, setAnswer] = useState<string>("");
  const [sources, setSources] = useState<Source[] | null>(null);
  const [inputTokens, setInputTokens] = useState<number | null>(null);
  const [outputTokens, setOutputTokens] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false); // true once first delta arrives
  const [error, setError] = useState<string | null>(null);
  const autoFiredRef = useRef(false);

  // Whether we have any result content to show (answer started OR sources received)
  const hasContent = answer.length > 0 || sources !== null;

  async function runQuery(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Reset all state
    setLoading(true);
    setStreaming(false);
    setError(null);
    setAnswer("");
    setSources(null);
    setInputTokens(null);
    setOutputTokens(null);

    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!r.ok) {
        // Non-SSE error response (e.g. 400 validation or 500 before streaming starts)
        const err = await r.json().catch(() => ({})) as { error?: string };
        throw new Error((err.error) || `HTTP ${r.status}`);
      }

      const body = r.body;
      if (!body) throw new Error("No response body");

      const reader = body.getReader();
      const decoder = new TextDecoder();
      // Buffer for bytes that haven't yet formed a complete SSE line.
      let lineBuffer = "";

      // Parse and dispatch a single SSE event payload string.
      function handleData(payload: string) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          // Malformed JSON — ignore
          return;
        }
        if (typeof parsed !== "object" || parsed === null) return;
        const evt = parsed as { type: string; [k: string]: unknown };

        if (evt.type === "sources") {
          setSources(evt.sources as Source[]);
        } else if (evt.type === "delta") {
          const text = evt.text as string;
          setAnswer((prev) => prev + text);
          // First delta: switch button label back to "Ask →"
          setStreaming(true);
        } else if (evt.type === "done") {
          setInputTokens(evt.inputTokens as number);
          setOutputTokens(evt.outputTokens as number);
          setLoading(false);
          setStreaming(false);
        } else if (evt.type === "error") {
          throw new Error(evt.message as string);
        }
      }

      // Read chunks and process SSE lines.
      // SSE format: "data: <payload>\n\n" — events are separated by blank lines.
      // Network reads can split anywhere (including mid-line or mid-event), so
      // we accumulate a line buffer and only process complete "data: ..." lines.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });

        // Split on newlines but keep incomplete trailing fragment in the buffer.
        const lines = lineBuffer.split("\n");
        // The last element is either "" (if chunk ended with \n) or an incomplete line.
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            handleData(line.slice(6).trim());
          }
          // Blank lines and other SSE fields (event:, id:, retry:) are ignored.
        }
      }

      // Flush any remaining buffered text through the decoder.
      const tail = decoder.decode();
      if (tail) {
        lineBuffer += tail;
        if (lineBuffer.startsWith("data: ")) {
          handleData(lineBuffer.slice(6).trim());
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setStreaming(false);
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
        <p className="small-caps text-base text-stone-400">Ask your coach</p>
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
          aria-label="Ask your golf coach"
          placeholder="Ask anything…"
          className="w-full resize-none border-b-2 border-stone-800 bg-transparent px-1 py-3 font-serif text-xl italic text-stone-100 placeholder:text-stone-500 focus:border-moss-500 focus:outline-none"
          autoFocus
        />
        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="small-caps text-base text-moss-300 transition-colors hover:text-moss-300/70 disabled:cursor-not-allowed disabled:text-stone-500"
          >
            {loading && !streaming ? "Searching the journal…" : "Ask →"}
          </button>
          {inputTokens !== null && outputTokens !== null && (
            <span className="font-mono text-sm text-stone-400">
              {inputTokens}↓ {outputTokens}↑ tokens
            </span>
          )}
        </div>
      </form>

      {/* Examples */}
      {!hasContent && !loading && (
        <section className="mt-12">
          <p className="small-caps text-base text-stone-400">Try, for instance</p>
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

      {/* Answer + Sources — rendered as soon as content starts arriving */}
      {hasContent && (
        <section className="mt-14 space-y-12">
          {answer.length > 0 && (
            <article className="space-y-5">
              <p className="small-caps text-base text-stone-400">Answer</p>
              <div className="whitespace-pre-wrap font-serif text-xl leading-relaxed text-stone-100 md:text-[1.35rem]">
                {renderWithCitations(answer)}
              </div>
            </article>
          )}

          {sources !== null && sources.length > 0 && (
            <aside className="border-t border-stone-900 pt-8">
              <p className="small-caps text-base text-stone-400">Sources</p>
              <ol className="mt-5 space-y-5">
                {sources.map((s, i) => {
                  const t =
                    s.start_seconds != null ? Math.floor(s.start_seconds) : 0;
                  return (
                    <li key={s.chunk_id}>
                      <a
                        href={`/lessons/${s.session_id}?v=${s.video_id}&t=${t}`}
                        className="group block"
                      >
                        <div className="grid grid-cols-[2rem_1fr] gap-4">
                          <sup className="font-serif text-lg italic text-moss-300">
                            {i + 1}
                          </sup>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-moss-500/10 px-1.5 py-0.5 font-mono tabular-nums text-moss-300 transition-colors group-hover:bg-moss-500/20">
                                <span aria-hidden="true">▶</span>
                                {fmtTimestamp(s.start_seconds)}
                              </span>
                              <span className="text-stone-300">
                                {fmtDate(s.recorded_at)}
                              </span>
                              {s.segment_title && (
                                <>
                                  <span className="text-stone-800" aria-hidden="true">·</span>
                                  <span className="min-w-0 font-serif italic text-stone-300 [overflow-wrap:anywhere]">
                                    {s.segment_title}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-stone-400 transition-colors group-hover:text-stone-200">
                              {s.chunk_text}
                            </p>
                            <p className="mt-1.5 font-mono text-sm text-stone-500">
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
