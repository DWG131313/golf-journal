# Design System — Golf Journal

## Product Context
- **What this is:** A personal coaching journal — years of TrackMan video lessons transcribed, segmented, tagged, and made semantically searchable.
- **Who it's for:** Danny. One user. Intimate, not multi-tenant.
- **Space/industry:** Sits between sports-coaching, personal knowledge bases, and editorial reading interfaces.
- **Project type:** Personal-knowledge web app — closer to a journal/archive than a SaaS dashboard.
- **Memorable thing:** *"These aren't records — they're moments."* The shift from data to memory. Every visual choice should serve this.

## Aesthetic Direction
- **Direction:** Editorial-Quiet — dignified typography, warm neutrals, reverence without preciousness.
- **Decoration level:** Minimal — typography and whitespace do the work. No icons-in-circles, no gradient blobs, no chrome.
- **Mood:** Like reading a well-bound notebook of your own coaching history. Slow, warm, trustworthy. The coach's voice gets to land, not compete with UI.
- **Anti-patterns to avoid:** SaaS-dashboard convergence (Inter + cool zinc + 3-column feature grid), purple gradients, "pill" everything, system-ui fallback as the actual design choice.

## Typography
- **Display / Hero:** **Instrument Serif** — single-axis editorial serif with an exquisite italic. Use for `<h1>` page titles, lesson title headers (`Lesson · May 8, 2026`), large numbers/metrics, pull quotes. Weight 400, both normal and italic. (Switched from Fraunces on 2026-05-17 — see Decisions Log.)
- **Body:** **Geist** — clean modern sans with subtle warmth. Use for paragraph copy, descriptions, list rows, transcripts. Weight 400 normal / 500 emphasis.
- **UI labels:** **Geist** via the `.small-caps` utility (`font-variant: all-small-caps; letter-spacing: 0.06em`) for section headers like "SEGMENTS", "TOPICS", "PRACTICE THEMES", "RECENT MENTIONS". Weight 500, **text-base (16px)**, stone-400. Small-caps glyphs render visually smaller than face value (cap-height ≈ x-height), so 16px is the readable floor — bumped from text-xs after type-scale calibration on 2026-05-18.
- **Data / Tables:** Geist with `tabular-nums` for counts (seg count, topic count, word count). Same family, locked-width digits.
- **Code / Timestamps:** **JetBrains Mono** — use for clickable timestamp chips (`0:33`), distances in source panels, any technical metadata that should feel like coordinates, not language.
- **Loading:** Self-host via `next/font/google` for Instrument Serif + Geist + JetBrains Mono. Preload display weight only; lazy-load others.
- **Scale (rem):** xs(0.75) sm(0.875) base(1) lg(1.125) xl(1.25) 2xl(1.5) 3xl(1.875) 4xl(2.25) 5xl(3) — apply Instrument Serif to 2xl+, Geist to base/sm/xs.

## Color
- **Approach:** Restrained — neutrals do the work, a single accent for emphasis. No semantic color stack (no error-red / warning-yellow / success-green). Hierarchy comes from weight + opacity, not hue.
- **Palette (warm neutrals — Tailwind `stone`, not `zinc`):**
  - Background (dark, default): `stone-950` (#0c0a09) — warm dark, not cool zinc
  - Surface (cards, panels): `stone-900/40` (#1c1917 @ 40%)
  - Surface elevated: `stone-900` (#1c1917)
  - Borders: `stone-800` (#292524)
  - Primary text: `stone-100` (#e7e5e4)
  - Secondary text: `stone-400` (#a8a29e)
  - Tertiary text / labels: `stone-500` (#78716c)
  - Disabled / faint: `stone-600` (#57534e)
- **Accent — moss green** (contemplative, golf-adjacent without being on-the-nose):
  - moss-500: #6b8d5a (default accent — buttons, links, selection)
  - moss-700: #4d6a3e (pressed, hover-dark)
  - moss-300: #a3c089 (emphasis text on dark, focused state)
- **Light mode:** Defer until requested. The product reads better dark — coaching content is often watched in the evening.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable, not compact — generous whitespace earns the editorial feel.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64) 4xl(96)
- **Vertical rhythm:**
  - Between major sections on a page: `space-y-10` to `space-y-12`
  - Between minor sections (e.g., list groups): `space-y-3` to `space-y-4`
  - Inside cards: `p-4` to `p-5`
  - Line-height for body prose: 1.65–1.7

## Layout
- **Approach:** Editorial — generous outer margins, no full-bleed, content can breathe.
- **Max content width:**
  - Prose-heavy views (transcript, ask answer): `max-w-2xl` (672px)
  - Home + lesson detail: `max-w-4xl` (896px)
  - Topics index (`/topics`): `max-w-5xl` (1024px) — wider container holds category groupings comfortably
- **Border radius (hierarchical):**
  - sm: 4px — small chips (timestamp buttons, status chips)
  - md: 6px — buttons
  - lg: 8px — cards, list containers
  - 2xl: 12px — major panels (answer container)
  - Never: `rounded-full` on everything. Pills only for status badges, never for buttons.

## Motion
- **Approach:** Minimal-functional — only motion that aids comprehension. No decorative entrance animations.
- **Easing:** `ease-out` for enter, `ease-in` for exit, `ease-in-out` for movement.
- **Duration:** micro(80ms) short(180ms) medium(320ms). No "smooth scroll" affectation — instant scrolling for keyboard nav, smooth only for explicit click-to-section.
- **Hover:** Subtle background shift (`hover:bg-stone-900/80`) on rows. No translate, no scale.

## Component-Level Applications

| Component | Treatment |
|---|---|
| Page H1 (masthead) | Instrument Serif 5xl–6xl, weight 400, stone-100 — hero presence on home + topic detail |
| Page H1 (secondary) | Instrument Serif 3xl–4xl, weight 400, stone-200 — used for italic subtitles like "{n} topics · {m} mentions" |
| Section labels (`SEGMENTS`, `TOPICS`, `MOST RECENT LESSON`) | Geist small-caps, text-base (16px), weight 500, letter-spacing 0.06em, stone-400. The readable floor for small-caps. |
| Mono tracked support labels (`FROM YOUR LAST 5 LESSONS`, `X SHOWN`, row time stamps) | JetBrains Mono text-sm (14px), uppercase, tracking-[0.18em]–[0.22em], stone-400. One tier below section labels for secondary metadata. |
| Affordance text-links (`VIEW ALL THEMES →`, `Ask →`, `← LESSONS`, `→ View all years`) | Same as section labels (text-base, small-caps), color moss-300 for go-forward, stone-400 for back-navigation. Underlines not used. |
| Nav links (top bar) | Geist text-sm (14px), uppercase, tracking-[0.22em], stone-400 default, moss-300 with `aria-current`. |
| Lesson row date | Geist sm, weight 500, stone-200; status chip stone-800 bg, stone-400 text |
| Lesson row filename | Geist xs, stone-500, truncated |
| Lesson card metrics | Geist sm, tabular-nums, stone-400 |
| Timestamp chip | JetBrains Mono xs in stone-800 bg, stone-200 text, rounded sm, hover stone-700 |
| Theme timestamp pill | JetBrains Mono text-xs (12px), moss-500/10 bg, moss-300 text, rounded (4px), hover moss-500/20. Used inside theme-detail mention links as the "click to hear the coach at this exact moment" affordance. (Bumped from text-[10px] during FINDING-003 readability pass.) |
| Source citation timestamp (ask page) | Same spec as Theme timestamp pill. Anchors each citation in the answer sources list to the exact moment in the source lesson. |
| Drill chip (lesson timeline) | Geist small-caps text-xs, moss-500/10 bg, moss-300 text, rounded (4px), ▸ glyph prefix. Variant of the theme-timestamp-pill pattern for non-time-based moss callouts. Used inline within segment bodies on lesson-detail timeline. |
| Lesson detail date hero | Instrument Serif text-5xl on mobile, text-7xl at md, text-8xl at lg+, weight 400, stone-100, tabular-nums. Monumental at md+, comfortable at 375px. Deliberately the largest type element in the system — the detail surface earns the largest moment. |
| Global nav links | Geist text-xs uppercase tracked (0.22em), stone-400 default, moss-300 with `aria-current="page"` when the route matches or descends (e.g., `/lessons/[id]` highlights "Library"). Hover: stone-100. Pathname-aware via client-island `SiteNav`. Home `/` has no highlight — it's a destination, not a tab. |
| Topic chip | Geist xs, weight 500, uppercase tracked, stone-700 bg, stone-300 text, rounded sm |
| Quote (coach said …) | Geist sm italic, stone-400, leading-relaxed |
| Citations [1] [2] | Fraunces sm, stone-500 |
| Answer prose (ask page) | Geist base, stone-100, line-height 1.7 |
| Quick Ask submit | Editorial text-link affordance ("Ask →" in moss-300 small-caps), positioned absolute on the input's right edge. Bottom border on the input doubles as the field divider. Not a filled button — keeps the masthead reading like a journal, not a form. Disabled state uses stone-500 (4.5:1 contrast). |
| Active/selected (e.g., a chosen filter pill) | moss-500 ring, moss-300 text |

## Risks taken (deliberate departures from convention)
1. **Warm stone instead of cool zinc.** Every AI-generated dashboard uses zinc/slate. Stone is immediately distinguishable and matches the personal-journal framing.
2. **Serif for display.** The category convention is sans-everywhere. Instrument Serif for hero/title earns the "this is content, not data" feeling.
3. **No semantic color stack.** No green-success, no red-error. The product is contemplative, not transactional — nothing here is urgent. Hierarchy through weight and opacity only.
4. **Moss as the only accent.** Single color, deliberately. Golf-adjacent without being literal.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-15 | Initial design system: Editorial-Quiet | Personal journal use case; differentiates from SaaS convergence; warm + dignified reflects "moments, not records" framing |
| 2026-05-17 | Switched display serif Fraunces → Instrument Serif | Fraunces variable-font axes rendered swashy WONK glyph alternates at large sizes (text-5xl+) that conflicted with the editorial-quiet aesthetic. Instrument Serif is single-axis, has a cleaner italic, and produces predictable glyphs at every size. |
| 2026-05-17 | Added moss-tinted timestamp pill sub-pattern (theme-detail only) | Per Variant D plan-design-review: theme-detail timestamps act as "click to hear the coach at this moment" emotional anchors. Moss tint earns the deviation from the standard stone-800 timestamp chip. |
| 2026-05-18 | Quick Ask is a text-link affordance, not a filled button | Editorial readability beats SaaS-button convention. The bottom border on the input acts as visual scaffolding; "Ask →" floats on the right edge in moss-300 small-caps. Updated H1 spec for masthead use at 5xl–6xl. Topics index uses `max-w-5xl` to hold category groupings. Captured during codex adversarial pass when the doc had drifted from shipped code. |
| 2026-05-18 | Sitewide round 2: applied locked system to `/ask`, `/lessons/[id]`, `/library` | Three deferred surfaces brought to system parity. New sub-patterns: drill pill (moss-tinted, ▸ glyph) on lesson timeline, source citation pill on ask page (▶ glyph variant). New rule: lesson date hero scales `text-5xl md:text-7xl lg:text-8xl` — monumental at md+, comfortable on mobile. Global nav gained path-aware active state via `SiteNav` client island (moss-300 for current route, exact + descendant matching, no highlight on home `/`). `/library` empty state under year filter now offers "→ View all years" recovery link. Bottom mobile nav still deferred. |
| 2026-05-18 | Type-scale calibration: section labels + affordance links text-xs → text-base; mono tracked + nav text-xs → text-sm | Editorial-quiet had compressed the middle tier (12px labels next to 16px body next to 30-60px display). On wide desktop layouts the small-caps labels read as footnote-faint. Bumped to make section anchors actually scannable. Date-hero internals + pill chip contents kept at text-xs (they live inside container units). |
| 2026-05-18 | Lesson = session (a date), not video. URL `/lessons/[id]` is session_id; deep-link contract becomes `?v={video_id}&t={seconds}` | The schema had `sessions` + `session_videos` tables from day one but they were empty; UI iterated `videos` directly and called each one a "lesson," producing 19 lessons / 5 months when there were actually 6 coaching days. Now: one session per date, stacked vertical recording blocks on the detail page (each its own scrubbable video + segments + transcript). Counts everywhere change: `19 lessons` → `6 lessons · 19 recordings`. Topic detail groups mentions by session, not video, so multiple recordings on the same day don't duplicate the date hero. |
| 2026-05-18 | Library rows show all recording headlines per session as clickable sub-rows under one date number | First-pass library refactor collapsed per-recording titles into a single "session headline," losing the per-recording titles that read as the day's "topics of focus." Now each session row stacks: date number (shown once), then a list of recordings each with `4:28 PM` / headline / `seg · topics` columns. Multi-recording days get a small uppercase mono aggregate footer below (`3 RECORDINGS · 13 SEGMENTS · 27 TOPICS`); single-recording days don't (would be redundant). Each recording links via `/lessons/{session_id}?v={video_id}` so click jumps to that specific block on the detail page. |
| 2026-05-18 | Topic taxonomy cleanup: 119 → 92 topics, 27 merges | LLM extraction generated case dupes (`Club Path` + `Club path`), punctuation variants (`Face to Path` + `Face-to-Path`), trailing-qualifier variants (`Setup` + `Setup / Address` + `Setup / Ball Position`), and synonym clusters (`Hip-Shoulder Disassociation` = `Hip-Shoulder Separation`). All 191 `topic_mentions` preserved (just repointed at canonical topic_ids). Migration saved at `src-demo/db/migrations/2026-05-18-topic-taxonomy-cleanup.sql`. Top-of-list counts roughly doubled: `Club Path` 14 → 18, `Face Angle` 10 → 13, `Setup` 2 → 5. Future LLM extractions will keep introducing new duplicates — pipeline-side canonicalization is a follow-up item. |
| 2026-05-18 | Sub-category column added to topics: 16 named buckets cover 55 of 92 topics | The long tail of single-mention topics was hard to scan. Added a `subcategory` TEXT column to `topics` and backfilled 55 topics across 16 buckets — Fundamentals > Setup (8 topics, 19 mentions); Mechanics > Club Path, Club Face, Weight/Ground, Strike/Contact, Hip, Sequencing, Speed/Tempo, Low Point, Shaft, Backswing, Lateral Motion, Shoulder, Body Rotation, Trail Side, Wrist. 37 topics intentionally stay un-subcategorized and render under an "Other" group at the end of their category (Swing Plane, Attack Angle, Lag, Takeaway, etc. — these are major standalone concepts that don't need a parent). `/topics` page now renders three-level hierarchy: Category > Subcategory > Topic. Migration at `src-demo/db/migrations/2026-05-18-topic-subcategories.sql`. Flat schema — `subcategory` is a string label, not a `parent_topic_id`. If subcategory aggregation (e.g., "all Wrist mentions in one view") becomes useful, upgrade to a parent_topic_id model later. |
| 2026-05-18 | Ingest-time canonicalization: smart `find_or_create_topic` + LLM vocabulary injection | Prep work before mass-ingesting ~850 videos (≈20 actual coaching screencasts). Two changes prevent the 27-merge cleanup from getting undone on each new ingest: (1) `find_or_create_topic` / `find_or_create_drill` in `src-demo/db/database.py` now do case-insensitive + trailing-qualifier-stripped matching before INSERT — six variants of "Club Path" all return the canonical id=4. (2) `build_vocabulary_block(db)` in `src-demo/ingest/analyze.py` builds a ~900-token text listing of existing canonical topic/drill names grouped by category/subcategory, prepended to every user message so the LLM stays consistent with prior extractions. Net cost: ~$0.003/call, ~$0.05 for the full 20-lesson ingest. Doesn't auto-assign subcategory to new topics (Fix #3 deferred — manual subcategory pass after ingest is acceptable for now). Note: only the `src-demo/ingest/` path is updated; the parallel `pipeline/src/analyze.py` (different DB, different schema) is unchanged. |
| 2026-05-19 | Mass-ingest run + four pipeline bugs surfaced and fixed | First real-world ingest of new content (5 new May 8 2025 iOS screen recordings → session 7, 39 segments, 88 topic mentions). Vocabulary injection worked perfectly: topic count stayed at 92 (zero new dupes). Four bugs surfaced under load and got fixed: (a) `classify.py` date parser missed the `ScreenRecording_MM-DD-YYYY HH-MM-SS` pattern — added `_SCREENREC_RE` regex. (b) `analyze.py` `max_tokens=4000` truncated Claude's JSON on long lessons (>10 min of speech) — bumped to 16000. (c) `triage.py` ran `faststart_video` BEFORE the file_hash duplicate check; since re-running faststart on already-faststart files produces slightly different bytes (ffmpeg non-determinism in metadata), this drifted the hash and caused already-ingested videos to be detected as new on re-runs — reordered so duplicate check happens first. (d) `triage.py` didn't auto-create `sessions` + `session_videos` rows on new video insert; new videos became orphans invisible to the session-based UI — added `find_or_create_session_for_date()` + `next_session_video_sequence()` helpers and calls them from `classify_and_route()`. All four fixes verified by re-running the smoke path. |
