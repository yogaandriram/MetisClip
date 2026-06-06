# CLAUDE.md — MetisClip: Agentic AI Video Clipping System

## Project Identity

**Name:** MetisClip
**Type:** Agentic AI SaaS Platform — Automated Video Clipping & Distribution
**Stack:** Next.js 14 (App Router) + Python FastAPI + Supabase + FFmpeg
**AI Core:** LangGraph Agent Orchestration + Groq LLM (Llama 3.3 70B) + Whisper (Transcription)

---

## System Overview

MetisClip is an **agentic AI pipeline** that autonomously:
1. Discovers high-potential YouTube videos based on user-defined keywords & filters
2. Analyzes long-form content (30-120 min) to detect viral-worthy scenes
3. Generates optimized short-form clips with dynamic subtitles
4. Schedules distribution to YouTube Shorts at peak engagement windows

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                │
│  Dashboard → Clip Editor → Subtitle Editor → Scheduler │
└──────────────────────┬──────────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                 API GATEWAY (FastAPI)                    │
│         Auth │ Jobs │ Clips │ Scheduler │ Upload        │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│            AGENTIC AI PIPELINE (LangGraph)               │
│                                                          │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌───────────┐ │
│  │Discovery│→ │ Analyzer │→ │ Clipper │→ │ Subtitler │ │
│  │  Agent  │  │  Agent   │  │  Agent  │  │   Agent   │ │
│  └─────────┘  └──────────┘  └─────────┘  └───────────┘ │
│       │             │             │             │        │
│  YouTube API   Groq LLM      FFmpeg       Whisper AI    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              DATA LAYER (Supabase)                       │
│     PostgreSQL │ Storage (Clips) │ Auth │ Realtime      │
└─────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
metisclip/
├── CLAUDE.md
├── frontend/                    # Next.js 14 App Router
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Landing page
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx       # Dashboard shell
│   │   │   ├── page.tsx         # Overview / metrics
│   │   │   ├── discover/page.tsx    # Keyword & filter config
│   │   │   ├── clips/page.tsx       # Generated clips gallery
│   │   │   ├── clips/[id]/page.tsx  # Clip detail + subtitle editor
│   │   │   ├── editor/[id]/page.tsx # Visual clip editor
│   │   │   ├── schedule/page.tsx    # Post scheduler calendar
│   │   │   └── settings/page.tsx    # API keys, preferences
│   │   └── api/                 # Next.js API routes (BFF proxy)
│   ├── components/
│   │   ├── ui/                  # Reusable primitives
│   │   ├── clips/               # Clip-specific components
│   │   ├── editor/              # Video & subtitle editor
│   │   ├── scheduler/           # Calendar & scheduling
│   │   └── dashboard/           # Dashboard layouts
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client
│   │   ├── api.ts               # Backend API client
│   │   └── utils.ts
│   ├── hooks/                   # Custom React hooks
│   ├── styles/
│   │   └── globals.css          # Design system tokens
│   ├── package.json
│   ├── next.config.js
│   └── tsconfig.json
│
├── backend/                     # Python FastAPI
│   ├── main.py                  # FastAPI app entry
│   ├── core/
│   │   ├── config.py            # Environment & settings
│   │   └── security.py          # Auth middleware
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.py
│   │   │   ├── jobs.py          # Discovery job CRUD
│   │   │   ├── clips.py         # Clip endpoints
│   │   │   ├── editor.py        # Subtitle edit endpoints
│   │   │   ├── scheduler.py     # Schedule CRUD
│   │   │   └── download.py      # Clip download
│   │   └── deps.py              # Dependency injection
│   ├── agents/                  # LangGraph Agentic Pipeline
│   │   ├── graph.py             # Master agent graph
│   │   ├── state.py             # Shared agent state schema
│   │   ├── nodes/
│   │   │   ├── discovery.py     # YouTube search agent
│   │   │   ├── analyzer.py      # Viral scene detection agent
│   │   │   ├── clipper.py       # FFmpeg clipping agent
│   │   │   ├── subtitler.py     # Whisper + subtitle agent
│   │   │   └── scheduler_ai.py  # Optimal timing agent
│   │   └── tools/
│   │       ├── youtube_api.py   # YouTube Data API v3 wrapper
│   │       ├── transcript.py    # youtube-transcript-api wrapper
│   │       ├── ffmpeg_ops.py    # FFmpeg operations
│   │       ├── whisper_stt.py   # Whisper STT wrapper
│   │       └── analytics.py     # YouTube Analytics API
│   ├── services/
│   │   ├── supabase_client.py
│   │   ├── storage.py           # Supabase Storage ops
│   │   ├── youtube_upload.py    # YouTube Upload API
│   │   └── queue.py             # Job queue (Redis/BullMQ)
│   ├── models/
│   │   ├── job.py
│   │   ├── clip.py
│   │   ├── subtitle.py
│   │   └── schedule.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── supabase/
│   └── migrations/              # SQL migrations
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Agentic AI Pipeline Detail

### Agent 1: Discovery Agent
**Purpose:** Find high-potential source videos on YouTube
**Tools:** YouTube Data API v3
**Logic:**
- Search by user-defined keywords (e.g., "AI", "startup", "tech")
- Filter by video type: podcast, interview, panel, talk show, lecture
- Filter by duration: minimum 30 minutes
- Filter by engagement: min views, like ratio, comment velocity
- Score and rank candidates by viral potential
- Store top N candidates in Supabase `source_videos` table

**LLM Task:** Analyze video titles, descriptions, and channel metadata to classify video type and estimate content quality. Reject clickbait/low-quality sources.

### Agent 2: Analyzer Agent
**Purpose:** Identify viral-worthy segments within long-form video
**Tools:** youtube-transcript-api, Groq LLM
**Logic:**
- Fetch full transcript with timestamps
- Chunk transcript into sliding windows matching target clip durations
- Send chunks to LLM with viral scoring prompt:
  - Emotional intensity (controversy, humor, shock, inspiration)
  - Standalone clarity (does the clip make sense without context?)
  - Hook strength (first 3 seconds grab attention?)
  - Quotability (contains memorable one-liners?)
  - Shareability (would someone repost this?)
- Score each chunk 0-100, rank by composite viral score
- Return top segments with exact timestamps and rationale

**Clip Duration Options:**
- 30-45 seconds (Ultra Short — TikTok optimized)
- 45-60 seconds (Short — Reels/Shorts sweet spot)
- 60-75 seconds (Medium — Story-driven clips)
- 75-90 seconds (Extended — Deep-dive moments)

**Output per clip:**
```json
{
  "start_time": "00:12:34",
  "end_time": "00:13:19",
  "duration_seconds": 45,
  "viral_score": 87,
  "hook_text": "Here's what nobody tells you about AI...",
  "tags": ["controversial", "quotable", "emotional"],
  "rationale": "Strong opening hook + contrarian take + emotional payoff"
}
```

### Agent 3: Clipper Agent
**Purpose:** Extract and process video clips
**Tools:** yt-dlp, FFmpeg
**Logic:**
- Download source video segment (not full video — use yt-dlp time ranges)
- Re-encode to vertical 9:16 (1080x1920) for Shorts
- Apply smart cropping: detect speaker face via face detection, center crop
- Normalize audio levels
- Generate thumbnail from highest-energy frame
- Upload processed clip to Supabase Storage
- Update `clips` table with metadata

### Agent 4: Subtitler Agent
**Purpose:** Generate and style dynamic subtitles
**Tools:** Whisper (via Groq API or local), FFmpeg
**Logic:**
- Transcribe clip audio via Whisper with word-level timestamps
- Generate SRT/ASS subtitle file with word-by-word timing
- Apply dynamic subtitle style:
  - 2-3 words per screen at a time (karaoke-style)
  - Active word highlighted (color pop)
  - Smooth fade transitions between word groups
  - Position: center-bottom with safe margin
  - Font: Bold sans-serif, high contrast stroke/shadow
- Burn subtitles into preview render
- Store raw subtitle data as editable JSON in Supabase

**Editable Subtitle Schema:**
```json
{
  "clip_id": "uuid",
  "words": [
    {
      "word": "Nobody",
      "start": 0.0,
      "end": 0.35,
      "confidence": 0.98
    }
  ],
  "style": {
    "font_family": "Montserrat Bold",
    "font_size": 48,
    "primary_color": "#FFFFFF",
    "highlight_color": "#FFD700",
    "stroke_color": "#000000",
    "stroke_width": 3,
    "position": "bottom-center",
    "words_per_group": 3,
    "animation": "pop"
  }
}
```

### Agent 5: Scheduler Agent
**Purpose:** Determine optimal posting times and auto-schedule
**Tools:** YouTube Analytics API, Groq LLM
**Logic:**
- Analyze target audience activity patterns via YouTube Analytics
- Cross-reference with topic/niche best-posting-time data
- Factor in timezone, day of week, competition density
- Suggest optimal posting windows (ranked)
- Auto-create scheduled uploads via YouTube Upload API
- Track posting queue in `scheduled_posts` table

---

## Database Schema (Supabase PostgreSQL)

### Core Tables

```sql
-- User preferences and API keys
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  youtube_channel_id TEXT,
  youtube_refresh_token TEXT,  -- encrypted
  default_clip_duration TEXT DEFAULT '45-60',
  default_keywords TEXT[] DEFAULT '{}',
  default_video_types TEXT[] DEFAULT '{podcast}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discovery job configurations
CREATE TABLE discovery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  keywords TEXT[] NOT NULL,
  video_types TEXT[] DEFAULT '{podcast}',
  min_duration_minutes INT DEFAULT 30,
  min_views INT DEFAULT 10000,
  clip_duration TEXT DEFAULT '45-60',
  max_clips_per_video INT DEFAULT 5,
  status TEXT DEFAULT 'pending',  -- pending/running/completed/failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Source videos found by discovery agent
CREATE TABLE source_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES discovery_jobs(id),
  youtube_id TEXT NOT NULL,
  title TEXT,
  channel_name TEXT,
  duration_seconds INT,
  view_count BIGINT,
  like_count BIGINT,
  video_type TEXT,
  quality_score FLOAT,
  status TEXT DEFAULT 'pending',  -- pending/analyzing/completed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated clips
CREATE TABLE clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_video_id UUID REFERENCES source_videos(id),
  user_id UUID REFERENCES profiles(id),
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  duration_seconds FLOAT,
  viral_score FLOAT,
  hook_text TEXT,
  tags TEXT[],
  rationale TEXT,
  storage_path TEXT,           -- Supabase Storage path
  thumbnail_path TEXT,
  subtitle_data JSONB,         -- Editable subtitle JSON
  subtitle_style JSONB,
  status TEXT DEFAULT 'processing', -- processing/ready/exported
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled posts
CREATE TABLE scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES clips(id),
  user_id UUID REFERENCES profiles(id),
  platform TEXT DEFAULT 'youtube_shorts',
  scheduled_at TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'Asia/Jakarta',
  title TEXT,
  description TEXT,
  tags TEXT[],
  status TEXT DEFAULT 'scheduled', -- scheduled/uploading/published/failed
  youtube_video_id TEXT,           -- after publish
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies
- All tables enforce `user_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE
- Storage bucket `clips` scoped to user folder: `{user_id}/clips/*`

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register with email |
| POST | `/api/auth/login` | Login, return JWT |
| POST | `/api/auth/youtube/connect` | OAuth2 YouTube connect |

### Discovery Jobs
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/jobs` | Create discovery job |
| GET | `/api/jobs` | List user's jobs |
| GET | `/api/jobs/:id` | Job detail + progress |
| DELETE | `/api/jobs/:id` | Cancel/delete job |

### Clips
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clips` | List user's clips |
| GET | `/api/clips/:id` | Clip detail + subtitle data |
| PUT | `/api/clips/:id/subtitles` | Update subtitle edits |
| POST | `/api/clips/:id/render` | Re-render with new subtitles |
| GET | `/api/clips/:id/download` | Download clip file |
| POST | `/api/clips/batch-download` | Download multiple as ZIP |

### Scheduler
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schedule` | List scheduled posts |
| POST | `/api/schedule` | Schedule a clip |
| PUT | `/api/schedule/:id` | Update schedule |
| DELETE | `/api/schedule/:id` | Cancel scheduled post |
| GET | `/api/schedule/optimal-times` | Get AI-suggested times |

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
GROQ_API_KEY=
WHISPER_MODEL=whisper-large-v3-turbo

# YouTube
YOUTUBE_API_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=

# Processing
FFMPEG_PATH=/usr/bin/ffmpeg
MAX_CONCURRENT_JOBS=3
CLIP_STORAGE_BUCKET=clips
TEMP_DIR=/tmp/metisclip

# Queue
REDIS_URL=redis://localhost:6379
```

---

## Frontend Design System

**Theme:** Dark-first, glassmorphism, neon accents
**Font:** Inter (UI) + JetBrains Mono (code/data)
**Colors:**
- Background: `#0A0A0F` (deep navy-black)
- Surface: `rgba(255,255,255,0.04)` (glass)
- Primary: `#7C3AED` (electric violet)
- Accent: `#06D6A0` (neon mint)
- Warning: `#F59E0B` (amber)
- Text: `#F1F5F9` (off-white)
- Muted: `#64748B` (slate)

**Components must include:**
- Skeleton loaders for all async states
- Real-time progress indicators for pipeline jobs (WebSocket)
- Drag-and-drop clip reordering in scheduler
- Inline subtitle preview with word-level highlighting
- Video player with timeline markers for detected viral scenes

---

## Development Commands

```bash
# Frontend
cd frontend && npm install && npm run dev     # localhost:3000

# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000         # localhost:8000

# Full stack (Docker)
docker-compose up --build
```

---

## Critical Implementation Rules

1. **Never download full videos** — use yt-dlp time-range downloads to save bandwidth
2. **All LLM calls go through Groq** — no OpenAI, no Gemini
3. **Subtitles are always editable** — store as structured JSON, burn only on final render
4. **Pipeline is async** — use WebSocket to push real-time progress to frontend
5. **Face detection for smart crop** — use MediaPipe or OpenCV for speaker centering
6. **Rate limit YouTube API** — respect quota (10,000 units/day), cache aggressively
7. **All clips stored in Supabase Storage** — signed URLs for downloads, 24hr expiry
8. **Queue long jobs** — use Redis + Celery for video processing tasks
9. **Idempotent pipeline** — if a job fails mid-way, it resumes from last checkpoint
10. **Mobile-responsive editor** — subtitle editor must work on tablet minimum

---

## LangGraph Agent State

```python
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph

class PipelineState(TypedDict):
    # Input
    job_id: str
    user_id: str
    keywords: list[str]
    video_types: list[str]
    clip_duration: str
    max_clips: int

    # Discovery output
    source_videos: list[dict]

    # Analysis output
    viral_segments: list[dict]

    # Clipper output
    processed_clips: list[dict]

    # Subtitler output
    subtitled_clips: list[dict]

    # Scheduler output
    scheduled_posts: list[dict]

    # Pipeline meta
    current_step: str
    errors: list[str]
    progress_pct: float
```

---

## Testing Strategy

- **Unit:** pytest for agent nodes, mocked API responses
- **Integration:** Full pipeline test with sample YouTube video ID
- **E2E:** Playwright for frontend flows (create job → view clips → edit subtitles → download)
- **Load:** Simulate 10 concurrent jobs to verify queue stability

---

## Deployment

- **Frontend:** Vercel (Next.js optimized)
- **Backend:** Railway or Fly.io (GPU-optional for Whisper)
- **Database:** Supabase Cloud (managed PostgreSQL)
- **Storage:** Supabase Storage (S3-compatible)
- **Queue:** Upstash Redis (serverless)
- **FFmpeg:** Bundled in Docker container
