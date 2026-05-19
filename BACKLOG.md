# Golf Journal — Backlog

Future work, organized by impact area. Items here are NOT scheduled — they're
candidates for later passes. Add ideas; remove items when shipped (or move to a
`CHANGELOG.md` section if you want a trail).

Each item: a name, why it would matter, and rough scope so future-you doesn't
have to re-derive the rationale.

---

## RAG / search quality

### Hybrid retrieval (semantic + BM25)
**Why:** Pure vector search misses literal keyword matches. Examples that probably
miss today: "alignment stick" not embedding near "rod on the ground," "8 iron"
not embedding near "mid iron." A user typing a specific term should always find
that term.
**Scope:** Add a BM25 / FTS5 index alongside the existing `chunks_vec`. Merge
results with reciprocal rank fusion (RRF) at query time in `lib/rag.ts`. Maybe
~2 hrs.

---

## Knowledge synthesis

### Cross-lesson timeline views
**Why:** The archive is one-dimensional today — list of lessons by date. Real
journal questions are temporal: "how has my swing path changed?", "which drills
have I worked on most in the last year?", "what topics haven't I revisited
in 6 months?"
**Scope:** New page `/timeline` or `/topics/[id]/history` that plots topic
mentions over time. Cheap data work — `SELECT topic_id, recorded_at FROM
topic_mentions JOIN videos` — but needs a chart component decision.

### First-person coach-voice summaries
**Why:** The synthesized session summaries today read third-person ("Student
worked on..."). For an archive that's supposed to feel like a personal coaching
journal, first-person plural ("We worked on..." / "Coach had me...") feels
more native. Small change with big tone shift.
**Scope:** Update `summarize_session.py` SYSTEM_PROMPT to specify voice.
Re-run `--all --force` to regenerate the 7 existing summaries. ~10 min.

---

## Practice journal feature

### Practice journal (TBD scope)
**Why:** Coaching lessons are inputs — actual practice happens between them.
Capturing what you practiced (and how it went) closes the loop: a coach's
suggestion in May 2025 only matters if you can see whether you actually
worked on it afterward.
**Scope:** Needs discovery. Possible directions:
- Log entries you type or dictate after a range session ("worked on alignment
  stick drill from May 8 lesson; still hooking under pressure")
- Auto-suggest practice items from recent lesson drills
- Link practice entries back to source lessons via deep-links
- A new top-level surface (`/practice`) and a new table (`practice_entries`)
Decide intended workflow before designing schema.

---

## Upload sources

### YouTube embed / extract as second upload option
**Why:** Coaching content on YouTube is rich (PGA pros, instructors). Today
upload only handles local files. A "paste URL" path widens the journal beyond
personal TrackMan recordings into anything-Danny-finds-useful.
**Scope:**
- `/upload` page gets a tab toggle: **File** | **YouTube URL**
- Backend uses `yt-dlp` (the OG repo had this in `pipeline/src/acquire.py` —
  worth referencing) to download to `Recordings/_uploads/` then hand to the
  existing triage → process pipeline
- Capture YouTube metadata (channel, title, original URL) into a new
  `videos.source='youtube'` row + `source_ref=<youtube_id>`
- UI: a small URL-validation step before kicking off the SSE stream
~3-4 hrs including yt-dlp wiring and the toggle UI.

---

## Mobile + storage (longer horizon)

### Mobile app usage
**Why:** This archive is the kind of thing you want to flip through on a phone
on the range, between buckets, or after a lesson. Today's `/library` works on
mobile but the upload + ask flows feel desktop-first.
**Scope:** Multiple paths to consider:
- Tighten mobile web (audit touch targets, bottom nav, gesture nav)
- PWA install with offline shell + cached lessons
- Native iOS app talking to the same DB via REST
Decide which depth is wanted before scoping.

### Video storage
**Why:** Today `Recordings/` is local, gitignored, ~1.2 GB and growing. For
mobile / multi-device access, videos need to live somewhere reachable. Single
machine = single point of failure for the content the journal is built from.
**Scope:** Pick a primary storage backend:
- Cloud (S3 / R2 / Vercel Blob) — durable, reachable from anywhere, costs
  pennies per GB but adds API plumbing
- Local NAS / external drive — cheaper, no cloud dependency, but doesn't help
  mobile
- Hybrid — local-first, cloud as backup + remote-access fallback
Storage backend choice affects upload pipeline, video serving, and mobile
roadmap together — worth deciding as a single design pass.

---

## Done (recent)

- Chunk refinement: 300-token windows with 50-token overlap via the embedder's
  own tokenizer (`offset_mapping` preserves verbatim text). Re-embed wipes
  `chunks_vec` rowids before `chunks`. 17 long segments split, 148 → 165 chunks.
  Probe query "practice on the top deck" surfaces the buried line at d=1.017
  (vs. an unrelated chunk at d=1.065 before). → `feat(rag)`
- LLM-synthesized session titles + summaries → `feat(sessions)` `deb76d2`
- API hardening: upload path traversal / DoS / subprocess cleanup, `/ask` abort
  on disconnect → `fix(api)` `9b95d8e`
- Drag-and-drop `/upload` with SSE progress → `feat(upload)` `bf92050`
- Streaming `/ask` (token-by-token) → `feat(ask)` `6d2ee48`
