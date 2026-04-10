# Golf Coach Knowledge Base — Design Spec

## Overview

A system that extracts coaching knowledge from golf video content into a searchable, browsable, and conversational knowledge base. Video sources include Danny's own Toptracer coaching session recordings, YouTube instruction videos, and any other golf video content.

## Problem

Danny has ~6 lesson recordings (~1.2GB) from coaching sessions on Toptracer, plus a growing collection of YouTube golf instruction videos he finds valuable. The coaching advice — swing mechanics, drills, data interpretation — is locked inside these videos with no way to search or quickly reference specific tips. Finding "what did my coach say about my driver takeaway?" or "what did that YouTube video say about lag in the downswing?" requires scrubbing through hours of footage.

## Goals

1. Extract all coaching knowledge from videos — both audio (verbal coaching) and visual (Toptracer data screens)
2. Make it searchable by topic, club, drill, or concept
3. Enable conversational Q&A: ask a question, get an answer with sources and visual context
4. Support adding new lesson videos over time
5. Build cost controls into the multimodal processing pipeline

## Non-Goals (V1)

- AI-generated instructional images (too unreliable for swing mechanics)
- Multi-user or sharing features
- In-app video playback (link to timestamps instead)
- Cloud deployment (local-first; deploy to Vercel is V2)

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────┐
│                  Ingestion Pipeline                  │
│                                                      │
│  .mov files                                          │
│    → ffmpeg (extract audio)                          │
│    → Whisper + diarization (transcribe, ID speakers) │
│    → ffmpeg (extract keyframes)                      │
│    → Claude multimodal (analyze chunks + frames)     │
│    → Chunking + embedding → SQLite + sqlite-vec      │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                   Next.js Web App                    │
│                                                      │
│  ┌──────────────┐    ┌────────────────────────┐      │
│  │  Browse View  │    │      Chat View          │     │
│  │              │    │                          │     │
│  │ Lesson index │    │ "What did my coach say   │     │
│  │ Topic outline│    │  about my grip?"         │     │
│  │ Search/filter│    │                          │     │
│  │ Segment view │    │ → RAG retrieval          │     │
│  │  w/ frames   │    │ → Cited answer + frames  │     │
│  └──────────────┘    └────────────────────────┘      │
│                                                      │
│  Cost Dashboard  │  Add New Lesson                   │
└─────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. Ingestion Pipeline

A Python CLI tool that processes video files through five stages.

#### Stage 0: Video Acquisition
- **Local files**: Point at a `.mov` or `.mp4` file on disk (existing flow)
- **YouTube**: Provide a URL → `yt-dlp` downloads the video + metadata (title, channel, description) to `data/downloads/`
- Each video gets a **source type** tag:
  - `coaching` — Danny's personal lesson recordings (multi-speaker, Toptracer)
  - `youtube` — Third-party instruction videos (typically single-speaker)
  - `other` — Any other video source
- Source type determines downstream behavior (e.g., whether to run speaker diarization)

#### Stage 1: Audio Extraction
- **Tool**: `ffmpeg`
- **Input**: `.mov` or `.mp4` file
- **Output**: `.wav` audio file
- Straightforward extraction, no processing

#### Stage 2: Transcription + Speaker Diarization
- **Tool**: `whisperx` (Whisper with word-level timestamps + speaker diarization)
- **Input**: `.wav` audio file
- **Output**: JSON transcript with word-level timestamps and speaker labels
- **Coaching videos**: Run diarization to separate Danny vs. coach. After first run, Danny labels which speaker ID is which — mapping persists for future videos
- **YouTube videos**: Typically single-speaker — diarization skipped or labels the single instructor
- **YouTube metadata** (title, description, channel) stored alongside transcript for richer context

#### Stage 3: Keyframe Extraction
- **Tool**: `ffmpeg` with scene detection
- **Input**: `.mov` file
- **Output**: PNG frames saved to `data/frames/{lesson_id}/frame_{timestamp}.png`
- Extract frames at:
  - Regular intervals (every 5 seconds)
  - Scene changes (significant visual difference — e.g., new Toptracer screen)
- Each frame tagged with its timestamp for linking to transcript

#### Stage 4: Multimodal Analysis
- **Tool**: Claude API (multimodal)
- **Input**: Transcript chunks + corresponding keyframes
- **Output**: Structured lesson segments (JSON)
- Process in batches: ~30-60 seconds of transcript + associated frames per batch
- Claude identifies:
  - **Topic**: What's being discussed (e.g., "driver setup", "iron ball position")
  - **Category**: Club, skill area, drill, mental game, etc.
  - **Coach tips**: Specific actionable advice from the coach
  - **Danny's questions/observations**: What Danny asked or described
  - **Visual context**: What the Toptracer data shows and how it relates to the coaching
  - **Summary**: 1-2 sentence summary of the segment
- Output schema per segment:
  ```json
  {
    "lesson_id": "2025-05-08-lesson-1",
    "segment_index": 3,
    "start_time": 145.2,
    "end_time": 198.7,
    "topic": "Driver takeaway path",
    "categories": ["driver", "takeaway", "club path"],
    "coach_tips": [
      "Keep the clubhead outside your hands in the first 18 inches"
    ],
    "danny_observations": [
      "I feel like I'm pulling it inside too quickly"
    ],
    "visual_context": "Toptracer shows club path at -3.2° (out-to-in), coach references this as the cause of the fade",
    "summary": "Coach addresses Danny's over-the-top move by focusing on the takeaway path, using Toptracer club path data to show the out-to-in pattern.",
    "frames": ["frame_145.5.png", "frame_152.0.png"],
    "transcript": "..."
  }
  ```

#### Stage 5: Chunking + Embedding
- Break segments into retrieval-sized chunks (~500-800 tokens each)
- Generate embeddings via a local embedding model (e.g., `all-MiniLM-L6-v2` via `sentence-transformers`) — no API cost
- Store in SQLite with `sqlite-vec` extension for vector similarity search
- Each chunk links back to its segment, frames, and source video timestamp

### 2. Data Storage

All local, file-based for V1.

#### SQLite Database (`data/golf_coach.db`)
Tables:
- `lessons` — metadata per video (id, filename, date, duration, processing status, source_type [coaching|youtube|other], source_url, source_metadata)
- `segments` — structured segments from multimodal analysis
- `chunks` — text chunks for RAG retrieval, with embedding vectors (via sqlite-vec)
- `processing_log` — token usage, timestamps, status per ingestion run

#### File System
```
data/
  downloads/          # YouTube downloads
  frames/{lesson_id}/frame_{timestamp}.png
  audio/{lesson_id}.wav
  transcripts/{lesson_id}.json
  golf_coach.db
```

#### Abstraction Layer
Storage accessed through a clean interface (`src/lib/storage.ts`) so the SQLite + local files can be swapped for Neon Postgres + Vercel Blob in V2 without touching app logic.

### 3. Next.js Web App

#### Browse View

**Lesson Index** (`/lessons`)
- Card per lesson: date, duration, topic summary, number of segments
- Sort by date, filter by topic/category

**Topic Outline** (`/topics`)
- Auto-generated topic tree from segment categories
- e.g., "Driver > Takeaway", "Irons > Ball Position", "Short Game > Chipping"
- Click a topic to see all segments across all lessons related to it

**Segment Detail** (`/lessons/{id}/segments/{index}`)
- Speaker-labeled transcript (coach highlighted differently from Danny)
- Key frames displayed inline at their timestamp positions
- Coach tips pulled out as highlighted callouts
- Link to original video timestamp

**Search** (`/search`)
- Full-text search across transcripts, summaries, and tips
- Filter by: speaker (coach vs danny), category, lesson
- Results show matching segment with context snippet + relevant frame

#### Chat View (`/chat`)
- Conversational interface using the AI SDK with Claude
- RAG retrieval: user question → embed → vector search → retrieve top chunks + frames
- Claude answers using retrieved context, citing sources
- Response format: answer text with inline citations linking to segment detail pages, plus relevant Toptracer frames displayed
- Example: "What drills did he give me for my slice?" → retrieves slice-related segments → Claude synthesizes answer with citations

#### Cost Dashboard (`/settings`)
- Total tokens used: ingestion vs. chat
- Per-video breakdown
- Budget configuration: daily/weekly limits, per-video caps
- Processing log with timestamps

#### Add New Lesson (`/lessons/new`)
- Two input methods:
  - **Local file**: Upload/select a `.mov` or `.mp4` file from disk
  - **YouTube URL**: Paste a URL → `yt-dlp` downloads the video and pulls metadata (title, channel, description)
- Source type auto-detected (YouTube vs local), can be overridden
- Dry-run estimate: shows estimated token count and processing time
- Confirm to start ingestion
- Progress indicator during processing

### 4. Cost Controls

- **Dry-run mode**: Before processing, estimate tokens based on transcript length × average frames. Show estimate, require confirmation.
- **Batch size cap**: Configurable frames per API call (default: 10 frames per batch)
- **Per-video budget**: Max tokens per video (configurable, default: 500K tokens). Pauses and asks for confirmation if exceeded.
- **Chat query budget**: Optional daily token limit for chat queries
- **Processing log**: Every API call logged with token count, timestamp, and purpose

Configuration stored in `config.json`:
```json
{
  "ingestion": {
    "max_tokens_per_video": 500000,
    "frames_per_batch": 10,
    "require_confirmation": true
  },
  "chat": {
    "daily_token_limit": null,
    "model": "claude-sonnet-4-6"
  }
}
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Ingestion CLI | Python (ffmpeg, whisperx, yt-dlp, anthropic SDK, sentence-transformers) |
| Web app | Next.js (App Router) |
| UI | Tailwind CSS + shadcn/ui |
| Chat | AI SDK + Claude API |
| Database | SQLite + sqlite-vec |
| Embeddings | sentence-transformers (local, no API cost) |
| Multimodal analysis | Claude API (multimodal) |

---

## Data Flow

```
1. User adds a video
   → Pipeline extracts audio → transcribes with speaker labels
   → Pipeline extracts keyframes
   → Pipeline sends transcript chunks + frames to Claude
   → Claude returns structured segments
   → Segments chunked and embedded into SQLite

2. User browses lessons
   → App reads segments from SQLite
   → Displays organized by lesson/topic with inline frames

3. User asks a question in chat
   → Question embedded → vector similarity search
   → Top chunks + associated frames retrieved
   → Claude generates answer using retrieved context
   → Answer displayed with citations and frames
```

---

## Future (V2)

- **Deploy to Vercel** for mobile access at the driving range
- **Migrate storage** to Neon Postgres (pgvector) + Vercel Blob
- **Annotated frame overlays** — arrows, labels on Toptracer screenshots highlighting what the coach referenced
- **Richer multimodal extraction** as models improve
- **Lesson comparisons** — track how advice evolved across sessions
