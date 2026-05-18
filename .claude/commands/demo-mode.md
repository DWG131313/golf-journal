---
description: Activate demo recording mode. We build a new dashboard in src-demo/ from scratch on camera. Prompts auto-log to "Project prompts to share/".
---

# Activate demo mode

Danny is recording this Claude Code terminal for a job-application video demo. The goal of the video is to show his **process** for building this Golf Coach project — using Claude Code as the collaborator on camera.

## Your immediate response to this command

Run this Bash command to activate the prompt-logging hook:

```bash
touch "/Users/dannygross/CodingProjects/Golf Coach/.claude/demo-mode-active"
```

Then output a **single short line** confirming demo mode is on. Something like:

> Demo mode active. Building the new dashboard in `src-demo/` from scratch. Prompts logging to `Project prompts to share/`. Lead the way.

Then stop. Do not list a plan. Do not preview files. Do not summarize the project. Wait for Danny's first prompt.

## What we're doing in this demo

We are building a **new dashboard from scratch** alongside the existing one. Same feature scope as the existing dashboard (lessons, topics, search, RAG chat) but rebuilt fresh with a redesigned schema. The existing dashboard at `src/` is reference material we can borrow from but is **not** the demo target.

- **Build target**: `src-demo/` (currently doesn't exist — Danny may create it on camera)
- **Data source**: existing `data/golf_coach.db` (5 lessons, 33 segments, 33 chunks of real coaching content)
- **Fresh schema**: Danny is going to redesign the data model on camera. Don't assume the existing schema is what we'll use — wait for him to lead.
- **Trackman download/cleanup/ingest flow**: Danny has a Chrome console downloader (`trackman-bulk-download.js`) producing new videos. He'll show the messy real workflow — download → cleanup → ingest — as part of the demo. Not a polished one-shot script.

## How to behave for the rest of this session

This is a **real-work** session, not a narrative role-play. Edit files, run commands, create directories, install packages — whatever Danny asks for, actually do it. No pretending, no "here's what I'd write."

### Output style — every line goes on camera

- Short paragraphs, focused code blocks, no walls of text.
- When you're about to make a change, give a one-sentence "why" before the action. Brief reasoning on camera is part of the skill demo.
- After making a change, summarize in one line what changed and what to verify visually.
- No emoji unless Danny adds them first.
- No "did you mean…" pushback when Danny jumps subjects. Follow.

### Mode exit

- If Danny says "demo off", "we're done", "exit demo", or runs `/demo-off` → run `rm -f "/Users/dannygross/CodingProjects/Golf Coach/.claude/demo-mode-active"` and drop the demo-mode framing for subsequent turns.

## Reference map (for quick orientation — don't dump on screen)

**Build target — currently empty**
- `src-demo/` (does not exist yet; Danny may want to `mkdir` it, or initialize a fresh Next.js app inside it)
- May create a separate DB copy at `data/golf_coach_demo.db` or query the existing DB directly — Danny's call.

**Reference: existing dashboard (don't edit, you can read for ideas)**
- `src/app/lessons/page.tsx` — lessons list
- `src/app/lessons/[id]/page.tsx` — lesson detail
- `src/app/topics/page.tsx` — topics view
- `src/app/search/page.tsx` + `src/app/api/search/route.ts` — search
- `src/app/chat/page.tsx` + `src/app/api/chat/route.ts` — RAG chat (AI SDK v6 streaming with `@ai-sdk/anthropic`)
- `src/lib/rag.ts` — retrieval + system-prompt assembly
- `src/lib/storage.ts` — DB access layer (`better-sqlite3`)
- `src/lib/db.ts` — connection setup
- `package.json` — Next.js 16, React 19, AI SDK v6, shadcn/ui, tailwind v4, better-sqlite3 12

**Reference: existing data (read-only unless Danny says otherwise)**
- `data/golf_coach.db` — SQLite. Tables: `lessons`, `segments`, `chunks`, `processing_log`. Schema in `pipeline/src/db.py`.
- 5 lessons fully processed, 33 segments with topics like "Draw shot mechanics", "Face-to-path relationship", "Downswing lag", "Swing plane".
- 33 embedded chunks (sentence-transformers, local).

**Reference: existing pipeline (probably not touching during the demo)**
- `pipeline/src/analyze.py` — multimodal Claude analysis (prompt at lines ~70–105)
- `pipeline/src/embed.py` — local embedding generation
- `pipeline/ingest.py` — CLI orchestrator

**Environment**
- `ANTHROPIC_API_KEY` lives in `.env.local` (loaded automatically by both Next.js and the Python pipeline). Real key, ~108 chars, sk-ant- prefix, verified.
- Existing dashboard runs at `http://localhost:3100` (already started in this session). Use a different port for `src-demo/` to avoid clash — `PORT=3200` is a good default.

**Process choices Danny may want to mention naturally**
- Parallel-agent build via worktrees (`.claude/worktrees/` dirs + `Merge branch 'worktree-agent-...'` in git log).
- Local sentence-transformers vs. paid embeddings (free, private, fast).
- SQLite + JSON columns vs. vector DB (small dataset, simpler).
- Just switched from Claude CLI (Max plan) to Anthropic SDK + API key for this demo.

---

**Reminder:** your reply to this slash command is the single confirmation line at the top. Everything else here is reference for the rest of the session.
