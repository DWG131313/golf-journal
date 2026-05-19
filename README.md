# Golf Journal

Golf Journal indexes years of TrackMan coaching videos so the specific advice a coach gave on a specific day is retrievable later. The pipeline transcribes the audio, has Claude extract structured segments and named topics with timestamps, embeds the result for semantic search, and surfaces it through a web dashboard.

## Why

A 20-minute coaching session contains dozens of specific call-outs — observations about a swing pattern, a recommended drill, a setup change — that disappear the moment the session ends. The videos themselves are unindexed: there's no way to ask *"what did the coach say about my grip last summer"* without watching every recording end-to-end.

## How

The pipeline ingests TrackMan portal exports plus iOS screen recordings. `ffmpeg` speech detection filters out the silent radar swing captures (around 95% of files in a typical TrackMan account). The narrated coaching videos get transcribed with Whisper running locally on Apple Silicon. Claude Sonnet analyzes each transcript to identify topical segments, named topics, drills, and exact timestamps. Everything gets embedded via `sentence-transformers` and indexed in `sqlite-vec` for semantic retrieval.

A canonical-vocabulary prompt plus a case-insensitive `find_or_create` layer keep the topic taxonomy stable across runs — the LLM sees the existing topic names on every analyze call, so new extractions reuse canonical names instead of inventing slight variants. Manual cleanup pass over the initial 119-topic extraction collapsed 27 duplicates (case variants, trailing qualifiers, synonym clusters) down to 92 canonical topics organized into 16 sub-categories.

## The dashboard

Four surfaces:

- **Library** — every coaching session by date, with each recording listed under its date
- **Lesson detail** — video player alongside a scrubbable segment timeline, topic chips, drill mentions, transcript on demand
- **Topics** — every concept the coach has discussed, grouped into sub-topics (Setup, Club Face, Hip, Wrist, Strike, Sequencing, etc.) with mention counts
- **Ask** — natural-language questions answered over every transcript, with citations that deep-link into the source moment

## Stack

- **Python ingest pipeline** — four resumable stages (triage, transcribe, analyze, embed), each tracking per-video status so a partial-failure batch can resume by re-running the same command
- **Next.js 16 + Tailwind v4 dashboard** — App Router with React Server Components for the data pages, client islands only where interaction requires it; custom editorial typography, no UI framework boilerplate
- **SQLite with `sqlite-vec`** — single-file local storage with built-in vector retrieval, no separate vector database to operate
- **Claude Sonnet via the Anthropic API** — produces structured JSON per transcript: speaker turns, segments, named topics, drills, exact timestamps
- **MLX Whisper on Apple Silicon** — local transcription, faster than realtime

Visual design system documented at `DESIGN.md`.
