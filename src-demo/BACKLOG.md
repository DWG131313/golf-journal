# src-demo backlog

Items deferred during the build session. Order is rough priority within each section.

## RAG improvements
- **Hybrid retrieval (level 3)** — wrap vector search with BM25 keyword retrieval; dedupe + re-rank. Closes the gap on queries with specific names, dates, or short terms where pure semantic search is weaker. Worth doing once lesson count climbs past ~50.
- **Query rewriting via Claude** — pre-pass user questions through a small Claude call that expands into 2–3 search queries (synonyms, related concepts). Wider recall.
- **Re-ranking** — after retrieval, pass top-20 chunks through Claude with relevance scoring; return top-5. Improves precision.
- **Streaming answers** — current `/api/ask` is non-streaming for simplicity. Add SSE or AI SDK v6 streaming so long answers stream token-by-token.

## Speaker / diarization
- **pyannote.audio fallback** — current speaker labels are LLM-heuristic from transcript content. If accuracy on multi-speaker dialogue isn't good enough, swap in `pyannote/speaker-diarization-3.1` for true audio-based diarization. Stores into the existing `transcripts.speakers_json` column.

## Vocabulary seeding
- **HackMotion drill catalog scrape** — public, server-rendered. Sample blocked when running as a subagent (no Bash perms). Do inline or grant subagent perms.
- **TrackMan University manual extraction** — free account, ~50–80 named concepts, a few hours' work. Login-walled so no scrape path.

## Design polish
- **Fraunces WONK axis rendering** — at display sizes (text-4xl on the home page H1), Fraunces renders with decorative WONK alternates (swashy G, curly J, flared u). The intended fix `font-variation-settings: "opsz" 24, "SOFT" 0, "WONK" 0` is in `globals.css` but Tailwind v4 strips it from the compiled output. Three viable fixes: (a) wrap the rule in `@layer utilities { ... }`, (b) inline `style={{ fontVariationSettings: '"opsz" 24, "SOFT" 0, "WONK" 0' }}` on every H1 element, or (c) swap Fraunces for Instrument Serif (single-weight, no quirky axes — listed as the alternative in DESIGN.md anyway).
- **Date stamps in lesson rows** — currently render in Geist; per DESIGN.md they could be Fraunces small caps for more editorial feel.
- **Subtle paper-grain texture on cards** — per DESIGN.md, not yet applied.
- **More moss touchpoints** — currently only on ask-page focus border. Citations [1] in answer text, active-state pills, and the "currently playing" cue on video player could pick up moss.
- **Tighter line-height + spacing on ask page prose** — line-height 1.7 per DESIGN.md.

## Dashboard UI
- **Lesson detail page** (`/lessons/[id]`) — title, summary, segments timeline, topic mentions with clickable timestamps, embedded video player with deep-link to a moment.
- **Topics index** (`/topics`) — every named topic across all lessons, with mention count + click-through to filtered lessons.
- **Drag-and-drop upload** — single-file ingest path that runs `classify_and_route` + transcribe + analyze + embed on a freshly dropped video.
- **Search filters** — date range, coach, status (when there are more lessons).

## Future enrichment
- **Shot data CSV import** — TrackMan TPS exports shot-by-shot ball + club data (club speed, spin, launch angle). If a coach shares these, join to lessons by date/timestamp.
- **TrackMan bulk download flow** — wire the existing `trackman-bulk-download.js` Chrome console script into a documented "new session → download → process → ingest" workflow.
- **Coach + session metadata UI** — populate `coaches` and `sessions` tables from filename patterns or manual entry; show "lessons with Coach X" views.

## Performance / ops
- **Batch parallelism** — current transcribe/analyze loops are sequential. ProcessPool / async batching could cut total time noticeably.
- **Prompt caching across batch** — already enabled on analyze.py system prompt; verify cache hits via `processing_log`.
- **Embedding model swap** — if recall is weak, try `all-mpnet-base-v2` (768-dim, slower but better) or BGE.
