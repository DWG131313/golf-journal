# Golf Coach Knowledge Base

## Project Overview
Video-to-knowledge pipeline for golf coaching. Processes local lesson recordings and YouTube instruction videos through multi-stage ingestion, extracting coaching knowledge into a searchable, embeddable knowledge base.

## Owner
Danny (daniel.gross85@gmail.com) — personal use, MacMini.

## Tech Stack
- Python 3.9+ (venv at `pipeline/.venv`)
- Anthropic SDK (Claude Sonnet 4.6 for analysis)
- sentence-transformers for embeddings
- yt-dlp for YouTube, ffmpeg for audio/keyframes
- SQLite for storage (`data/golf_coach.db`)

## Key Commands
```bash
# Setup
python3 -m venv pipeline/.venv
source pipeline/.venv/bin/activate
pip install -r pipeline/requirements.txt

# Tests
pipeline/.venv/bin/python -m pytest pipeline/tests/ -v

# Pipeline (entry point not yet built — stages run individually)
```

## Pipeline Stages
| Stage | Status | What |
|-------|--------|------|
| 0 — Acquire | Done | Local file + YouTube download via yt-dlp |
| 1 — Audio | Done | ffmpeg extraction to 16kHz mono WAV |
| 2 — Transcribe | Not built | whisperx with speaker diarization |
| 3 — Keyframes | Not built | ffmpeg scene-change extraction |
| 4 — Analyze | Not built | Claude multimodal: frames + transcript → structured segments |
| 5 — Embed | Not built | sentence-transformers chunking + vector storage |

## Key Files
- `pipeline/src/` — Core modules (acquire, audio, config, cost, db, models)
- `config.json` — Runtime config (500K token budget, model selection)
- `docs/superpowers/specs/` — Design spec and implementation plan
- `Recordings/` — 6 local coaching sessions (~1.2GB, gitignored)

## Claude Code Knowledge Base

When you need to leverage Claude Code's advanced capabilities — hooks, custom agents, skills, permission patterns, multi-agent orchestration, or SDK usage — reference the central learnings at:

- **Architecture & capabilities (99 flags, 41 tools, 27 hooks, 100+ env vars):** `/Users/dannygross/CodingProjects/Claude Code codebase/learnings/CLAUDE_CODE_DEEP_DIVE.md`
- **Hook recipes & reference (all 27 events with I/O schemas):** `/Users/dannygross/CodingProjects/Claude Code codebase/learnings/HOOKS_REFERENCE.md`
- **Custom skill templates (8 production skills):** `/Users/dannygross/CodingProjects/Claude Code codebase/learnings/skills/`
- **Full Claude Code source:** `/Users/dannygross/CodingProjects/Claude Code codebase/src/`

Read these when the task involves configuring hooks, building skills, defining custom agents, optimizing permissions, setting up multi-agent workflows, or leveraging any Claude Code feature beyond basic usage. The source code is the definitive reference for how any feature actually works.

**Golf Coach-specific patterns in the CC source:**
- **Async generator pipelines:** `src/query.ts:219-250` — `async function*` yielding events through stages; model for 5-stage video pipeline
- **Concurrent batch processing:** `src/utils/generators.ts:32-72` — `all(generators, cap)` for parallel frame analysis
- **Resumable state:** `src/query.ts:204-279` — mutable State carried + persisted across loop iterations; model for pipeline checkpointing
- **Token estimation:** `src/services/tokenEstimation.ts:203-435` — 2000 tokens per image, 4 bytes/token text; model for cost.py pre-flight
- **Progress tracking:** `src/services/tools/StreamingToolExecutor.ts:368-374` — yield progress immediately, buffer nothing
- **Subprocess management:** `src/utils/ShellCommand.ts` — StreamWrapper + size watchdog for ffmpeg/whisper-cpp
- **Full pattern map:** `learnings/PROJECT_PATTERNS_MAP.md`
