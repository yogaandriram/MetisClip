# CLAUDE.md — MetisClip Desktop: Agentic AI Video Clipping (Windows-first)

> **Status:** The product is moving from a **Web SaaS** (browser + Next.js + FastAPI + Supabase + Cloudflare R2) to a **local-first Windows desktop app**.
> This file is both the PRD and the engineering contract.
> - §2 describes what exists in the repo **today** (web build).
> - §3 onward describe the **target** desktop product.
>
> When the two conflict, build toward the target and fix the known issues in §2.3 as you touch the code.
> Last revised: 2026-11-10

---

## 1. Product Overview

### 1.1 Identity

| | |
|---|---|
| **Name** | MetisClip |
| **Type** | Agentic AI desktop app for automated video clipping. Posting the finished clips is done by the user, outside the app. |
| **Platform** | Windows 10 (22H2+) / Windows 11, x64. macOS and Linux come later and are out of scope for v1. |
| **Model** | Local-first: download, face tracking, encoding and rendering run on the user's PC, and the database and all media files are stored on the user's own drive. Only AI inference and YouTube APIs go over the network. |
| **Shell** | Electron (electron-builder, NSIS installer) |
| **UI** | Next.js 14 App Router, **static export** loaded inside Electron |
| **Engine** | Python FastAPI as a sidecar process, frozen with PyInstaller |
| **Render** | Remotion: prebuilt bundle plus bundled Chrome Headless Shell |
| **Data** | **MongoDB** (Community Server, bundled `mongod.exe` run locally by the app) for metadata, plus local files for media. Both live in one data folder the user picks on their own drive (§6). |
| **AI core** | LLM from one of seven providers chosen in Pengaturan: OpenAI, Anthropic (Claude), Google Gemini, xAI (Grok), DeepSeek, Alibaba Qwen, or any OpenAI-compatible endpoint (default: 9Router). Groq Whisper (STT), MediaPipe (face tracking) |
| **UI language** | Bahasa Indonesia (default timezone `Asia/Jakarta`) |

### 1.2 What it does

1. **Discover:** takes a link to a long-form YouTube video (podcast, interview, talk show and similar), or a video file from the user's PC ("Upload Video", used in place). There is no keyword search (D6).
2. **Analyze:** reads the transcript and finds viral-worthy segments using an LLM with a critic pass.
3. **Clip:** downloads only those time ranges, then smart-crops them to 9:16 with face tracking.
4. **Subtitle and render:** generates word-level subtitles with Whisper. They stay editable, and the final MP4 is rendered with animated subtitle presets and the Brand Template.
5. **Export:** copies the finished MP4s to a folder of the user's choice. The user posts them to social media themselves; the app has no scheduling or account connections (§1.4).

### 1.3 Why desktop

- **Cost:** video processing (per-frame MediaPipe, x264 encoding, Chromium render) is the most expensive part of the stack. On desktop it runs on the user's hardware, so there is no compute or storage bill per clip.
- **The storage round-trip goes away.** Today a clip is uploaded to R2 after cropping, downloaded again before render, uploaded again after render, then downloaded by the user. `*.r2.dev` is also blocked by some Indonesian ISPs (Internet Positif), which already forced proxy and presigned-URL workarounds (commits `b1aff8b`, `97a4b2e`, `483168b`, `af4328c`). Local files remove this whole class of bugs.
- **Fewer YouTube blocks:** downloads come from the user's residential IP, which YouTube bot-checks far less than datacenter IPs.
- **Privacy and offline use:** source videos and clips never leave the PC unless the user uploads them. Editing and rendering an existing clip works offline.

### 1.4 Goals and non-goals (v1 desktop)

**Goals**
- **G1:** One installer. No Python, Node, npm or FFmpeg needs to be installed beforehand.
- **G2:** The full pipeline (discover → analyze → clip → subtitle → render) runs locally with only user-supplied API keys (BYOK).
- **G3:** Parity with the current web UI: Super Agents, Discover, Clips gallery, subtitle editor with 13 presets, Brand Template.
- **G5:** Jobs survive app restarts and crashes and resume from their last checkpoint.

**Non-goals (v1)**
- macOS or Linux builds
- Multi-user or team collaboration, and cloud sync of clips
- **Scheduling and social media publishing** (YouTube Shorts, TikTok, Instagram) and connecting social accounts (OAuth). Removed by the owner on 2026-11-09 (D3): uploads need OAuth apps, API audits and, for TikTok/Instagram, server-side secrets or public video URLs. Users export clips and post them with the platforms' own tools.
- **Keyword search for videos** (YouTube Data API). Removed by the owner on 2026-11-09 (D6): the user pastes a YouTube link or uploads a video file instead, so no YouTube API key or search quota is needed.
- Mobile or tablet layouts. These are replaced by desktop window-sizing requirements (§9).

### 1.5 Target user and hardware

- Content creators and clippers in Indonesia, often working on mid-range laptops.
- **Minimum:** Windows 10 22H2 x64, 4-core CPU with AVX (required by MongoDB 5.0+), 8 GB RAM, 15 GB free on the drive chosen for MetisClip data, broadband internet.
- **Recommended:** 8 cores, 16 GB RAM, SSD. A GPU is optional; NVENC, QSV or AMF is used when present.

---

## 2. Current State (As-Is: web build)

### 2.1 Actual architecture today

```
Browser ─ Next.js 14 (localhost:3000)
           ├─ Supabase directly from the client (Auth, Postgres tables, Storage bucket brand_assets)
           ├─ Next API routes: /api/composio/{connect,disconnect,status,sync}, /api/dashboard/stats
           └─ FastAPI (localhost:8000)
                ├─ POST /api/jobs → BackgroundTasks → agents/static_pipeline.py
                │     discovery → analyzer (9router LLM) → processor (yt-dlp, MediaPipe, FFmpeg, Groq Whisper) → scheduler_ai
                │     every clip is uploaded to Cloudflare R2
                └─ POST /api/clips/{id}/render (SSE)
                      download raw clip from R2 → serve via /api/clips/media/{id}
                      → `npx.cmd remotion render build SubtitleOverlay` → upload to R2 → copy to ~/Downloads
backend/mcp_server.py: the same nodes exposed as MCP tools for LLM-driven orchestration
```

### 2.2 Implementation status

| Area | Files | Status | Notes |
|---|---|---|---|
| Discovery by keyword | `agents/nodes/discovery.py`, `agents/tools/youtube_api.py` | ✅ Works | Uses `search.list` with `videoDuration=long` and 3 results per keyword × type, then `videos.list`. Drops videos under 30 min. Quality score = `min(100, like/view·1000 + min(20, views/50k))`. Without `YOUTUBE_API_KEY` it returns mock data. There is no LLM classification yet. |
| Discovery by URL | `discovery.py` | ⚠️ Partial | Extracts the video ID, but title, duration (3600) and stats are **mocked**. |
| Transcript | `agents/tools/transcript.py` | ✅ Works | youtube-transcript-api (`en`, `id`) → fallback: download full audio, split into 20-min chunks, Groq Whisper → fallback: mock transcript. |
| Analyzer | `agents/nodes/analyzer.py` | ✅ Works | Splits the transcript into ~10-min chunks and calls the LLM in JSON mode. Rejects clips starting before 90 s ("intro ban"). Stops early once `max_clips` are found. A Critic LLM pass fixes sentence boundaries (accepted only if the shift is under 30 s). Duration is then expanded or trimmed in code. Falls back to mock segments. |
| Processor (clip + crop + subtitles) | `agents/nodes/processor.py`, `tools/ffmpeg_ops.py`, `tools/smart_crop.py` | ✅ Works | yt-dlp `--download-sections` (≤1080p) → MediaPipe face scan at ~5 fps with 1.5 s moving-average pan → raw frames piped to FFmpeg → 1080×1920 x264 CRF 18. Thumbnail is the middle frame. Whisper word timestamps use the Groq key from the `super_agents` row. Uploads to R2. Runs in parallel with `ThreadPoolExecutor`. |
| Subtitle editor and presets | `frontend/app/(dashboard)/clips/[id]`, `frontend/lib/presets/*` | ✅ Works | 13 presets are shared by the editor preview **and** the Remotion composition (`render-engine/src/SubtitleOverlay.tsx` imports `../../frontend/lib/presets`). |
| Export render | `backend/api/routes/clips.py` (`/render`), `render-engine/` | ✅ Works (web-only design) | Requires Node and npm on the machine (`npx.cmd`). Loads Google Fonts at render time. Uses an R2 round-trip. |
| Brand Template | `frontend/app/(dashboard)/brand-template/*` | ✅ Works | `brand_settings`, `caption_settings`, `layout_settings` and `ai_settings` per agent. Assets go to the Supabase Storage bucket `brand_assets`. **Desktop: a shared library of named templates (§6.3).** |
| Super Agents (niche workspaces) | `frontend/app/(dashboard)/agents`, `contexts/AgentContext.tsx` | ✅ Works | The active agent is stored in `localStorage`. |
| Scheduler | `agents/nodes/scheduler_ai.py` | ⚠️ Heuristic | Fixed slots at 17:30 and 19:45 WIB, 2 per day starting tomorrow, with template titles. No LLM and no analytics. **Removed on desktop (D3).** |
| YouTube upload | `services/youtube_upload.py`, `api/routes/scheduler.py` | ❌ Mock | Returns a fake video ID. The OAuth refresh code exists but is unused. **Removed on desktop (D3).** |
| Social connections | Composio via Next API routes | ⚠️ Partial | Stores connection status in `agent_social_connections`. Not used for uploading. **Removed on desktop (D3).** |
| Orchestration | `agents/static_pipeline.py`, `mcp_server.py` | ✅ Works | Sequential. LangGraph is only used for the state type (`add_messages`), and there is no `graph.py`. The MCP server keeps job state in memory (`JOB_MEMORY`). |
| Queue and progress | FastAPI `BackgroundTasks`, frontend polling | ⚠️ | No Redis or Celery, despite the old docs. Discover polls Supabase every 3 s and mixes in **simulated** progress. Render uses SSE. |
| Auth | Supabase Auth; `backend/core/security.py` | ⚠️ | The JWT is decoded **without signature verification**. |

### 2.3 Known issues to fix during migration

| # | Issue | Where | Impact |
|---|---|---|---|
| K1 | Every segment uses `viral_segments[0].youtube_id` | `processor.py:111` | When a keyword job finds several videos, clips are cut from the **wrong video**. |
| K2 | `list_clips` has no `@router.get("")` decorator | `clips.py:120` | `GET /api/clips` is not registered. It was unnoticed because the UI reads Supabase directly. |
| K3 | JWT signature is never verified | `security.py:21,33` | Anyone can forge a user ID. |
| K4 | `frontend/.env.local` (with a Composio API key) has been tracked in git since the first commit and is pushed to `origin` | repo | **Rotate the key**, untrack the file and add it to `.gitignore`. |
| K5 | Schema drift: the migration lacks `super_agents`, `brand_templates`, `agent_social_connections` and the columns `discovery_jobs.youtube_url`, `total_scenes`, `processed_scenes`, `agent_id` | `supabase/migrations/` | The DB cannot be recreated from the repo. |
| K6 | Jobs are saved without `agent_id`, and clips are not scoped to an agent | `jobs.py:62` | Dashboard stats (filtered by `agent_id`) are always empty. |
| K7 | `requirements.txt` is incomplete: opencv-python, mediapipe, numpy, imageio-ffmpeg, openai, youtube-transcript-api, pytz, requests and mcp are missing | `backend/requirements.txt` | Builds cannot be reproduced, and PyInstaller will miss modules. |
| K8 | Port mismatch: the frontend defaults to `:8002`, the backend to `:8000`, and CORS only allows `:3000` | frontend pages, `main.py` | Fragile local setup. |
| K9 | Paths are relative to the working directory (`./tmp`, `system_pipeline.log`, `export_pipeline.log`), and the `render-engine` path is computed from `__file__` | `config.py`, `main.py`, `clips.py` | Breaks once frozen or installed under `%LOCALAPPDATA%\Programs`. |
| K10 | Render shells out to `npx` and fetches Google Fonts online | `clips.py:353`, `SubtitleOverlay.tsx`, `globals.css` | Fails on PCs without Node and fails offline. |
| K11 | `HOST=0.0.0.0` | `.env`, `config.py` | On desktop this exposes the API to the LAN and triggers a Windows Firewall prompt. |
| K12 | Subprocesses are started without `CREATE_NO_WINDOW` | `ffmpeg_ops.py`, `smart_crop.py`, `processor.py`, `clips.py` | Console windows flash in a GUI (frozen) build. |
| K13 | Supabase project URL is hard-coded | `config.py`, `next.config.js`, `lib/supabase.ts` | Leaks project identity and is hard to change. |
| K14 | Frontend uses React 18 while render-engine uses React 19, yet they share preset components | `package.json` ×2 | Risk of subtle preview ≠ render differences. |
| K15 | `enforce_clip_limit` silently deletes everything beyond a user's 50 newest clips | `core/cleanup.py` | Unacceptable for local user files. Replace with a disk-usage view and manual cleanup. |
| K16 | Smart crop has no fallback: if tracking fails, the clip fails | `ffmpeg_ops.py` | Add a center-crop fallback. |

### 2.4 Migration progress (branch `feat/desktop-app`, started 2026-11-09)

The tables above describe the web build. On this branch:

| Area | State |
|---|---|
| Engine (`backend/`) | FastAPI sidecar on MongoDB: `core/{paths,config,procs,db,llm,secrets,settings_store,events,auth,queue}.py`, routes per `frontend/lib/engine.ts`, `run.py` ready-line protocol, `--selftest`. Supabase, R2, JWT, Redis, LangGraph and `cleanup.py` are removed. |
| Known issues fixed in the engine | K1 (each segment uses its own `youtube_id`), K2, K3 (per-launch token instead of JWT), K6 (jobs require `agent_id`), K7 (pinned `requirements.txt`), K9, K11 (127.0.0.1 only), K12, K15 (no auto-deletion), K16 (center-crop fallback) |
| Desktop shell (`desktop/`) | Electron 45 main + preload: mongod lifecycle (auth, orphan-lock recovery), engine sidecar with restart, `app://` static UI, data-root wizard IPC and missing-drive recovery screen, path-checked shell IPC. Verification hooks (`METISCLIP_UI_DIR`, `METISCLIP_DATA_ROOT_OVERRIDE`, `METISCLIP_SCREENSHOT*`, `METISCLIP_AUTOQUIT_MS`) are documented in `desktop/README.md`. |
| Frontend | Static export, no Supabase or Composio. All data goes through `lib/engine.ts` + WS events. New: setup wizard, Jobs, System (incl. "Update yt-dlp"), `clips/detail?id=` editor. Fonts are local woff2. Brand Template: intro/outro, music and layout ratio/fit were removed (they never reached the render); `layout_settings` keeps only the safe zone, and the AI subtitle settings work (§5.4). Brand templates are a named, shared library (migration 003); agents pick a default and the clip editor can switch a clip's template. |
| Render (`render-engine/`) | `dist/render.js` worker (`@remotion/renderer`, run via Electron-as-Node), React 18.3.1 like the frontend (K14), local fonts (K10), Chrome Headless Shell bundled by `build-desktop.ps1`. |
| yt-dlp | Bundled exe is copied to `%LOCALAPPDATA%\MetisClip\bin` and updated there (`POST /api/system/update-ytdlp`). Downloads prefer H.264 over HTTPS (HLS sections are very slow). Builds older than a few months get HTTP 403 from YouTube, so keep the pin fresh. |
| Removed (D3, 2026-11-09) | Scheduling (`scheduler_ai`, `/api/schedule`, Jadwal Post page), social account connections (`/api/connections`, Settings card) and the `metisclip://` protocol. Migration `002_remove_publishing` drops `scheduled_posts` and `super_agents.social_connections` from existing databases after the usual pre-migration backup. |
| Removed (D6, 2026-11-09) | Keyword search ("Pencarian Pintar"): `tools/youtube_api.py`, the YouTube Data API key, the `api_cache` collection, the agents' default keywords and video types, and the job filters (`video_types`, `min_duration_minutes`, `min_views`) and quality score. Jobs take a YouTube link only. Migration `005_remove_keyword_search` cleans existing databases (after the pre-migration backup) and deletes the stored YouTube key. |
| Video upload (2026-11-09) | Cari Video has two tabs, "Link YouTube" and "Upload Video" (drag & drop via `window.metis.pathForFile`, or the file dialog). The file is used in place, never copied; jobs store `source.local_file_path`. Its transcript always comes from Whisper, so outside dev the job is refused without the Groq key. Migration `006_local_video_upload` lets `source_videos` hold a file instead of a `youtube_id`. |
| Design system (2026-11-10) | `DESIGN.md` defines a light, green-only, soft-organic UI (§9.1). The frontend is rebuilt on it: tokens/base/components CSS in `frontend/styles/`, the component library in `frontend/components/ui`, the shell (logo, nav rail with the liquid active indicator, top bar) in `frontend/components/shell` and `app/(dashboard)/layout.tsx`. Electron's window background and startup-error page use the same greens. |
| Still open | K4: the Composio key in `frontend/.env.local` is untracked but **must still be rotated**. Phase 1 items not done: signing, installer run on a clean VM, tray/auto-update, daily yt-dlp update check. |
| Tests | `pytest backend/tests` runs against a throwaway bundled `mongod.exe`. It includes a link-job pipeline test (real FFmpeg and MediaPipe) and resume idempotency. |
| Packaging | `scripts/build-engine.ps1` → `backend/dist/metisclip-engine/` (onedir, about 320 MB, mostly cv2 and mediapipe), with a smoke test and self-test. `scripts/build-desktop.ps1 -Pack` → `desktop/dist/MetisClip-Setup-<version>.exe` (about 440 MB, unsigned). |

---

## 3. Target Architecture (Desktop)

### 3.1 Process model

```
┌── MetisClip.exe (Electron) ─────────────────────────────────────────────────────────────┐
│ Main process (Node)                                                                     │
│  • single-instance lock · window state · tray · toasts · auto-update                    │
│  • Sidecar manager: starts mongod, then the engine; monitors both; restarts on crash;   │
│    graceful shutdown in reverse order; process-tree kill only as a last resort          │
│  • Generates a per-launch session token and hands {baseUrl, token} to preload           │
│                                                                                         │
│ Renderer (sandboxed Chromium): Next.js static export served via app://metisclip         │
│   window.metis.* (contextBridge IPC): dialogs, open folder, notifications, update       │
│   HTTP + WebSocket → http://127.0.0.1:{port}  (Authorization: Bearer <token>)           │
└────────────────────┬────────────────────────────────────────────────────┬───────────────┘
                     ▼                                                    ▼
┌── metisclip-engine.exe (PyInstaller · FastAPI) ──────┐   ┌── mongod.exe (bundled) ──────┐
│ REST routes · WS event bus · job queue (workers)     │   │ MongoDB Community Server     │
│ Pipeline: Discovery → Analyzer (+Critic) →           │──▶│ 127.0.0.1:{dbPort} · --auth  │
│           Processor → Render (export)                │   │ dbPath <DATA_ROOT>\db        │
│ Child processes (CREATE_NO_WINDOW, tracked):         │   └──────────────────────────────┘
│   yt-dlp.exe · ffmpeg / ffprobe · render worker      │
└────────┬───────────────────────────┬─────────────────┘
         ▼                           ▼
 Local files on the user's drive     Network (only): LLM endpoint · Groq Whisper ·
 <DATA_ROOT>\library, cache,         YouTube via yt-dlp (metadata, sections) ·
 exports, backups                    update feed
```

### 3.2 Key technology decisions

| Decision | Choice | Why | Not chosen |
|---|---|---|---|
| Desktop shell | **Electron** + electron-builder | Remotion needs Node and Chromium anyway, and Electron ships both. The React UI is reused as-is, and editor preview and final render run on the same Chromium engine. | **Tauri:** we would still have to bundle Node and Chrome for Remotion. WebView2 differs from Remotion's Chromium, which breaks preview == render. Adds a Rust toolchain. |
| UI delivery | Next.js `output: 'export'` served through a custom `app://` protocol | No Node server at runtime, fast startup | `next start` inside Electron: an extra process, port and memory for no gain |
| Engine packaging | PyInstaller **onedir** | Fast start and fewer antivirus false positives | onefile: extracts to `%TEMP%` on every launch, which is slow and often AV-flagged |
| Database | **MongoDB Community Server**: `mongod.exe` bundled with the app and started locally as a child process (§6.2); PyMongo driver; versioned migrations | Owner decision. The document model fits the data (subtitle words, brand settings and checkpoints are nested JSON), and the data stays on the user's own disk | SQLite (embedded, lighter footprint); Supabase Postgres or MongoDB Atlas (cloud, so not local, and server keys cannot ship in a desktop binary) |
| Media storage | Plain files in `<DATA_ROOT>\library` on a drive the user chooses; documents store relative paths | Users can open, copy and back up clips in Explorer; fast streaming with HTTP Range | GridFS (bloats the database, slower to stream, invisible to the user); cloud object storage (R2) |
| Queue | In-process worker pool plus `discovery_jobs` / `render_jobs` collections | No extra daemons besides the bundled mongod | Redis + Celery |
| Real-time | WebSocket `/ws/events` from the engine | Replaces Supabase polling and fake progress | — |
| Render | Prebuilt Remotion bundle plus a `render.js` worker using `@remotion/renderer`, run with `ELECTRON_RUN_AS_NODE=1` through the app's own exe and a bundled Chrome Headless Shell | No Node or npm install needed | `npx remotion render` |
| Binaries | `ffmpeg.exe`, `ffprobe.exe`, standalone `yt-dlp.exe`, `deno.exe` (the JS runtime recent yt-dlp needs for YouTube; verify against the pinned version) | The standalone yt-dlp can self-update without an app release | yt-dlp as a frozen Python module, which cannot be updated |
| Secrets | Windows Credential Manager via Python `keyring` (the engine is the only owner) | DPAPI-backed per Windows user | Plain `.env`, or keys stored in DB rows (`super_agents.groq_api_key` today) |
| Account | None required in v1 (see D1) | Works fully offline after setup | — |

### 3.3 Startup and shutdown sequence

1. Main acquires the single-instance lock (a second launch focuses the existing window) and shows a splash screen.
2. Main reads `%APPDATA%\MetisClip\bootstrap.json` to find the data folder (`DATA_ROOT`).
   - **First run** (no file): main opens the wizard's **data location** step first, handled by main over IPC, because MongoDB and the engine cannot start without it.
   - **Saved folder not available** (drive unplugged, letter changed): recovery screen (§6.1). Never create a new, empty database silently.
3. Main starts `mongod.exe` (flags in §6.2) on a free port and watches it for the whole session. If startup fails because `<DATA_ROOT>\db\mongod.lock` is held by an orphan `mongod.exe` from a previous crash (verified by executable path), main terminates it and retries once.
4. Main generates a 32-byte random token and spawns `metisclip-engine.exe` with these environment variables:
   `METISCLIP_ENV`, `METISCLIP_TOKEN`, `METISCLIP_DATA_ROOT`, `METISCLIP_APPDATA_DIR`, `METISCLIP_BIN_DIR`, `METISCLIP_MONGO_PORT`, `METISCLIP_NODE_PATH` (= `process.execPath`), `METISCLIP_RENDER_DIR`.
5. The engine connects to MongoDB, retrying for up to 30 s. On first run it creates the app's database user and stores the password in Credential Manager. If a migration is pending, it writes a backup (§6.4) and then migrates. It marks `running` jobs as `interrupted`, starts its workers, binds `127.0.0.1:0` (an OS-assigned port), then prints one stdout line: `{"event":"ready","port":<n>,"version":"x.y.z"}`.
6. Main reads the port and checks `GET /health`, which includes a MongoDB ping. On timeout (30 s) it shows a dialog with "Buka folder log" and "Coba lagi".
7. Main loads `app://metisclip/index.html`. Preload exposes `window.metis.engine = { baseUrl, token }`.
8. On first run the app continues with the rest of the **Setup Wizard** (§9.2).
9. **Quit:** main calls `POST /internal/shutdown`. The engine stops its workers, cancels running children (up to 5 s), sends MongoDB's `shutdown` admin command, and exits. Main waits for both processes (up to 15 s), then kills whatever is left (Job Object or `taskkill /T /F`), so no orphan ffmpeg, Chrome or mongod processes remain.
10. **Crashes:** if the engine crashes, main restarts it up to 3 times with backoff. If mongod crashes, main restarts mongod; the engine reconnects automatically and jobs that lost a write are marked `interrupted`. After repeated failures main shows an error screen with "Buka folder log".

### 3.4 Security model

- The engine listens on **127.0.0.1 only**. Every route, including media streaming and WebSocket, requires the per-launch token (header, or `?token=` for `<video src>` and WS).
- CORS allows only the `app://metisclip` origin.
- **mongod** listens on 127.0.0.1 only, on a random free port (never the default 27017, so it cannot clash with a MongoDB the user already runs), with `--auth`. The app's database user and its random password are created on first run, and the password is kept in Credential Manager. The `db\` folder is restricted to the current Windows user.
- Renderer settings: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. A strict CSP allows `connect-src` only to the engine. The preload API is a small, explicit allow-list.
- **Nothing shipped is secret.** The installer must not contain a Supabase service-role key, R2 keys or any other server credential.
- File paths received from the renderer are resolved and checked to stay inside the library, cache or user-chosen export folders (no path traversal). `shell.openPath` and `showItemInFolder` go through IPC with the same check.
- Secrets never appear in the DB, logs or crash reports. `GET /api/secrets` only answers whether each key is set. The stored value is returned only by `POST /api/secrets/{name}/reveal`, when the user clicks the eye icon of an API key field (owner decision, 2026-11-09: users can view their own keys); like every route it needs the per-launch token, and the response is `Cache-Control: no-store`.

---

## 4. Directory Structure (target)

```
metisclip/
├── CLAUDE.md                     # this PRD / engineering contract
├── DESIGN.md                     # design system, the source of truth for UI tokens
├── desktop/                      # NEW: Electron shell
│   ├── src/main/
│   │   ├── index.ts              # lifecycle, single-instance, window state
│   │   ├── engine.ts             # spawn / ready / health / restart / tree-kill
│   │   ├── mongod.ts             # NEW: start/stop bundled mongod, orphan-lock recovery
│   │   ├── data-root.ts          # NEW: choose / validate / move the data folder, bootstrap.json
│   │   ├── protocol.ts           # app:// → frontend/out
│   │   ├── tray.ts               # tray, background mode for long jobs
│   │   ├── updater.ts            # electron-updater
│   │   └── ipc.ts                # dialogs, shell, notifications (path-checked)
│   ├── src/preload/index.ts      # contextBridge → window.metis
│   ├── resources/                # icons; bin/ (mongod, ffmpeg, yt-dlp, deno) filled by scripts/fetch-binaries.ps1 (gitignored)
│   ├── electron-builder.yml
│   └── package.json
├── frontend/                     # Next.js 14 → static export (output: 'export')
│   ├── app/
│   │   ├── setup/                # NEW first-run wizard
│   │   └── (dashboard)/          # dashboard, discover, clips, clips/detail?id=,
│   │                             # brand-template, settings, agents, jobs (NEW), system (NEW)
│   ├── components/ui/…
│   ├── contexts/AgentContext.tsx
│   ├── lib/
│   │   ├── engine.ts             # NEW typed client for the local engine (replaces Supabase queries)
│   │   ├── events.ts             # NEW WS subscription hook
│   │   ├── presets/              # 13 subtitle presets, shared with render-engine (single source)
│   │   └── constants.ts
│   └── public/fonts/             # NEW bundled woff2 for every SUPPORTED_FONTS entry
├── backend/                      # FastAPI engine (sidecar)
│   ├── main.py                   # binds 127.0.0.1:0, prints the ready line, token middleware
│   ├── core/
│   │   ├── config.py             # env + settings table
│   │   ├── paths.py              # NEW: data / cache / library / bin resolution (no CWD paths)
│   │   ├── db.py                 # NEW: PyMongo client, collections, migration runner, backups
│   │   ├── llm.py                # NEW: the single LLM client (7 providers, §8.1)
│   │   ├── llm_providers.py      # provider registry: base URL, key name, default model
│   │   ├── secrets.py            # NEW: keyring (Windows Credential Manager)
│   │   ├── procs.py              # NEW: subprocess helper (CREATE_NO_WINDOW, cancel, tree-kill)
│   │   ├── events.py             # NEW: WS event bus
│   │   └── queue.py              # NEW: persistent job queue and workers
│   ├── api/routes/               # jobs, clips, agents (+ brand template), settings,
│   │                             # system, files, dashboard, ws
│   ├── agents/
│   │   ├── state.py
│   │   ├── static_pipeline.py
│   │   ├── nodes/                # discovery.py, analyzer.py, processor.py
│   │   └── tools/                # ytdlp.py, transcript.py, ffmpeg_ops.py, smart_crop.py
│   ├── services/                 # render.py (render worker), backup.py (EJSON backups)
│   ├── models/                   # NEW: Pydantic document models, one per collection
│   ├── db/migrations/            # 001_init.py (collections, $jsonSchema validators, indexes), 002_…
│   ├── mcp_server.py             # optional MCP interface (off by default)
│   ├── metisclip-engine.spec     # PyInstaller spec (collect mediapipe/cv2 data files)
│   └── requirements.txt          # complete and pinned
├── render-engine/                # Remotion
│   ├── src/                      # index.ts, Root.tsx, SubtitleOverlay.tsx
│   ├── render.ts                 # NEW: programmatic renderMedia worker, JSON-line progress
│   └── build/                    # prebuilt bundle (generated)
├── scripts/                      # NEW PowerShell build scripts
│   ├── fetch-binaries.ps1        # pinned mongod / ffmpeg / yt-dlp / deno + SHA256 check
│   ├── build-engine.ps1
│   └── build-desktop.ps1
└── supabase/                     # legacy web schema; only kept if D1 = account
```

**To remove or replace during migration:**
- `frontend/middleware.ts`, `frontend/app/api/*`: their logic moves to the engine.
- `@supabase/auth-helpers-nextjs` and the Composio packages. Done: MetisClip no longer uses Composio anywhere (code, dependencies or config); do not reintroduce it.
- `backend/core/storage.py` (R2), the R2 parts of `/render`, `/api/clips/proxy-media`, and the auto-copy to `~/Downloads`.
- `backend/core/cleanup.py` (see K15).
- Docker, Vercel and Railway deployment.

---

## 5. Agentic Pipeline

### 5.0 Orchestration

- **Static pipeline** (`agents/static_pipeline.py`) is the default, triggered by the UI "Generate" button. It is sequential and deterministic; the LLM is only used inside the Analyzer, which saves tokens.
- **MCP server** (`backend/mcp_server.py`) exposes the pipeline as MCP tools (`list_agents`, `clip_youtube_video`, `clip_local_video`, `job_status`, `list_clips`, `render_clip`) for LLM-driven orchestration. It is optional and off by default on desktop. It talks to the running engine over HTTP (`METISCLIP_ENGINE_URL`, `METISCLIP_TOKEN`), so job state always lives in MongoDB.
- **LangGraph has been removed.** Nodes receive a `JobContext` (`agents/context.py`: progress, errors, checkpoint and cancel helpers) and the job state lives in the `discovery_jobs` document. Do not add a graph unless a node genuinely needs branching or loops.
- **Clip count:** `max_clips` (UI "Jumlah Klip (Max)", 0 = unlimited) caps the whole job. It is also the per-video early-stop limit (`config.max_clips_per_video`).
- **Checkpointing:** after every node, and after every finished clip inside the Processor, persist progress to `discovery_jobs.checkpoint`. `POST /api/jobs/{id}/resume` skips completed work.
- **Cancellation:** every node checks a cancel flag between units of work, and `core/procs.py` kills running children.

**Node flow** (`agents/static_pipeline.py`):

```
run_job(job_id, cancel)                    claims pending → running atomically
  discovery.run(ctx)        → source_videos         checkpoint.discovery_done
  analyzer.run(ctx, videos) → segments              checkpoint.analysis_done + checkpoint.segments
  processor.run(ctx, segs)  → clips (parallel)      checkpoint.done_segment_ids (+1 per clip)
  → completed | failed (PipelineError/LLMError, Indonesian message) | cancelled | interrupted (shutdown)
```

`agents/state.py` keeps a plain `PipelineState` TypedDict (no LangGraph `messages`) for reference only.

### 5.1 Discovery Agent (`nodes/discovery.py`, `tools/ytdlp.py`)

- **Input:** a YouTube link, or a video file on the user's PC ("Upload Video": drag & drop or file picker; MP4, MKV, MOV, WEBM, M4V, AVI). Keyword search was removed (D6); do not reintroduce the YouTube Data API.
- **YouTube logic:** extract the video ID → `yt-dlp -J --skip-download` for title, channel, duration and stats → save one `source_videos` document (deterministic `_id`, so a re-run never duplicates it). Without metadata the job fails with yt-dlp's Indonesian error; dev uses a placeholder.
- **Upload logic:** the file is used where it is, never copied into the data folder (multi-GB sources). `check_local_video` (also run by `POST /api/jobs`) requires an absolute path, a supported extension, and a stream ffmpeg can read with both video and audio. The source video stores `file_path`, the file name as title, the duration, and `file_fingerprint` (sha256 of path, size and mtime; the transcript cache id). If the file is moved before processing, the job fails with "File video tidak ditemukan" and can be resumed once the file is back.
- Jobs whose source type is neither `url` nor `local_file` (keyword jobs from older databases) fail discovery with "Sumber job ini tidak didukung lagi"; resuming one still works when its videos were already found.

### 5.2 Analyzer Agent (`nodes/analyzer.py`, `tools/transcript.py`)

- **Transcript chain:** youtube-transcript-api (`en`, `id`) → download audio (yt-dlp) → 20-min chunks → Groq Whisper `verbose_json`. Uploaded files skip YouTube subtitles: their audio track goes straight to the 20-min chunks and Whisper. Mock data is allowed in dev only. Transcripts are cached in the `transcripts` collection (`yt:<youtube_id>` or `file:<fingerprint>`), so resumes and re-analysis never refetch them.
- **Scoring prompt:** hook strength (first 3 s), emotional intensity, standalone clarity and shareability, in JSON mode at temperature 0.2.
- **Guards:**
  - intro ban (`start < 90 s` is rejected in code)
  - early stop once `max_clips` are found
  - Critic pass that fixes sentence boundaries and duration (accepted only when both edges move less than 30 s)
  - programmatic expand or trim to the duration range
  - sort by `viral_score`, keep the top `max_clips`
- **Duration options:** 30–45 s (Ultra Short), 45–60 s (Short, the default), 60–75 s (Medium), 75–90 s (Extended).

**Segment output** (actual):

```json
{
  "source_video_id": "uuid",
  "youtube_id": "dQw4w9WgXcQ",
  "start_time": 754.0,
  "end_time": 799.0,
  "duration_seconds": 45.0,
  "viral_score": 87,
  "hook_text": "Here's what nobody tells you about AI...",
  "tags": ["controversial", "quotable", "emotional"],
  "rationale": "Strong opening hook + contrarian take + emotional payoff",
  "status": "processing"
}
```

**Desktop changes**
- All LLM calls go through `core/llm.py`: the provider, model and (for OpenAI-compatible) base URL come from settings, the key from that provider's secret. Clients are cached; do not create a new `OpenAI(...)` client per call, and do not spoof a browser User-Agent per call.
- Providers accept different request parameters (reasoning models refuse `temperature` or `max_tokens`, some lack JSON mode). `core/llm.py` retries a refused request without the named parameter and remembers it per endpoint and model; Anthropic goes through its Messages API with a JSON-only instruction.
- Outside dev, a missing or invalid key shows an actionable Indonesian error (e.g. "API key LLM belum diisi di Pengaturan") instead of producing mock clips.
- Handle HTTP 429 and timeouts with retry and backoff, and report them as job events.

### 5.3 Processor Agent (`nodes/processor.py`, `tools/ffmpeg_ops.py`, `tools/smart_crop.py`)

This merges the original Clipper and Subtitler agents. Each segment goes through these steps, with segments processed in parallel workers:

1. **Download:** `yt-dlp --download-sections *{start}-{end}` (≤1080p, mp4). Never the full video. For an uploaded file, `ffmpeg_ops.cut_section` makes a frame-accurate re-encoded cut instead (scaled so neither side exceeds 1920 px, never upscaled).
2. **Smart crop:** MediaPipe face detection at ~5 fps, following the face closest to its last position, with a 1.5 s moving-average pan. Raw BGR frames are piped to FFmpeg (x264 CRF 10 intermediate).
   - **Fallback:** a static center crop when no face is found or tracking fails (K16).
3. **Merge and scale:** tracked video plus the original audio → 1080×1920, CRF 18, AAC 128k.
4. **Thumbnail:** currently the middle frame. Backlog: the highest-energy frame.
5. **Whisper:** extract audio → Groq Whisper with `timestamp_granularities=["word","segment"]`. If only segment timing is returned, split the words evenly within each segment.
6. **AI marks:** when the effective AI subtitle settings (§5.4) enable keywords or emojis, one LLM call (`agents/tools/caption_ai.py`) marks words with `keyword: true` and/or `emoji`. Non-fatal: on failure the clip is kept and a job error is recorded.
7. **Persist:** insert a `ready` clip with editable `subtitle_data`. `subtitle_style = {}` so it inherits the Brand Template until overridden.

**Desktop changes**
- No upload. Write `raw.mp4` and `thumb.jpg` into `<DATA_ROOT>\library\…` (§6.1) and store paths relative to `<DATA_ROOT>` in the clip document.
- **Fix K1:** each segment uses its own `youtube_id`.
- Auto-detect a hardware encoder in this order: `h264_nvenc` → `h264_qsv` → `h264_amf` → `libx264`, falling back to `libx264` on any encoder error.
- Default worker count is `max(1, min(3, physical_cores // 2))`, configurable in Settings. Show a RAM warning when it exceeds the safe level.
- Make `--extractor-args youtube:player_client=…` configurable. Support a `cookies.txt` import for bot-check errors (see §15).
- **Backlog:** audio loudness normalization (`loudnorm`, about −14 LUFS).

### 5.4 Render / Export (`api/routes/render.py`, `render-engine/`)

- Subtitles are always data and are burned in only during export.
- **Composition:** `SubtitleOverlay`, 1080×1920 at 30 fps. Props:
  - `videoUrl` (the engine media URL with token)
  - `words`
  - `style` = brand `caption_settings` ⊕ clip `subtitle_style` (without its `ai` key)
  - `ai` = AI subtitle settings: defaults ⊕ brand `ai_settings` ⊕ clip `subtitle_style.ai`
  - `brandSettings`
  - `durationInFrames` (source length; `calculateMetadata` shortens it to the kept segments)
- **Presets:** the editor preview, the Brand Template preview and Remotion import the same 13 presets from `frontend/lib/presets/`: auraglow, kineticbox, lumina, popshadow, typewriter, neonpulse, slideupfade, cinematicbar, hologram, glitch, staggerfade, elasticscale, velocityzoom. This keeps preview == render. Never fork them.
  - All three render through the shared `CaptionLayer` (position, size in `cqw`, word pages, AI emoji) and `LogoOverlay`. The parent box must set `container-type: inline-size`.
  - Presets are pure functions of caption time (`anim.ts` helpers): no CSS keyframes or transitions, sizes in `em`. A browser preview and a frame-by-frame Remotion render therefore show the same frame.
  - Words are shown in pages of 1–4 words (`wordsPerPage`, capped by the characters that fit one line), not a moving window.
  - Each preset has its own default font settings in `getDefaultConfig` (family, weight, size, case, outline, shadow, colors). Picking a preset in the editor or the Brand Template resets the font settings to those defaults; "Bawaan preset" does the same for the current preset.
  - `metrics.ts` estimates text width from per-font glyph advances (measured from the bundled fonts) to decide how many characters fit on a line, and shrinks a page whose longest word would not fit inside the video.
- **AI subtitle settings** (`ai`: `fillerWords`, `pauses`, `keywords`, `emojis`; defaults `true/false/true/false`, kept in sync between `captions.ts` and `services/render.py`):
  - Filler words (eh, hmm…) are hidden from the captions and, like silent pauses, cut from the export by `computeKeepSegments` (Remotion `<Series>` of trimmed `OffthreadVideo`s). The editor preview skips the same ranges.
  - Keywords and emojis are word marks set by the LLM (`POST /api/clips/{id}/subtitles/enrich`, or automatically by the Processor) and editable per word in the clip editor.

**Desktop flow**
1. `POST /api/clips/{id}/render` creates a `render_jobs` document and returns its ID immediately. Progress arrives over WS, so closing the editor does not kill the render.
2. The engine spawns the render worker: `METISCLIP_NODE_PATH` with `ELECTRON_RUN_AS_NODE=1`, running `render-engine/render.js --props <file>`. The worker calls `selectComposition` + `renderMedia` on the prebuilt bundle with the bundled Chrome Headless Shell and `gl: "angle"`. It prints JSON-line progress.
3. Output goes to `{clip}/final.mp4`. A toast appears with "Buka folder", and the editor offers "Export ke…" to copy the file to a user-chosen folder.
- One render runs at a time by default, because Remotion already parallelizes frames. Concurrency is configurable.

**Fonts**
- Bundle every `SUPPORTED_FONTS` entry as local woff2 in both the UI and the render bundle, and remove the runtime Google Fonts `@import` and `<link>` (works offline and gives deterministic output).
- `Courier New` is not a Google font: map it to a bundled monospace font or drop it.

**Also:** align the React major version between frontend and render-engine (K14).

---

## 6. Data Layer (local: MongoDB + local files)

All data stays on the user's own computer, in two kinds of storage inside one **data folder** that the user chooses:

- **MongoDB** (the bundled `mongod.exe`) holds the metadata: Super Agents with their brand templates, jobs, source videos, transcripts, clips (including editable subtitles) and settings.
- **Local files** hold the media: raw clips, final renders, thumbnails and brand assets. MongoDB only stores their paths, relative to the data folder.

### 6.1 Storage locations

The user picks the data folder in the Setup Wizard. The default is `%USERPROFILE%\MetisClip`; users with a small C: drive can pick e.g. `D:\MetisClip`.

```
<DATA_ROOT>\                       e.g. D:\MetisClip (chosen by the user)
├── db\                            MongoDB dbPath (WiredTiger files). Managed by mongod only; never edit by hand.
├── library\
│   └── {agent-slug}\
│       ├── {clip_id}\raw.mp4      9:16 clip without subtitles
│       ├── {clip_id}\final.mp4    last export with burned-in subtitles
│       └── {clip_id}\thumb.jpg
│   └── _brand\{template_id}\     brand logos, overlays and sample videos of a brand template
├── exports\                       default "Export ke…" target (can point elsewhere)
├── cache\                         segment downloads, audio chunks, render props, intermediates;
│                                  purged per job, capped (default 10 GB)
├── backups\                       compressed EJSON database backups (§6.4)
└── .metisclip\                    engine-private: db-credentials.json (ACL: current user only, §6.2)
```

Outside the data folder:

| What | Path | Notes |
|---|---|---|
| App binaries (including `mongod.exe`) | `%LOCALAPPDATA%\Programs\MetisClip\` | Per-user install, replaced on update |
| Bootstrap pointer | `%APPDATA%\MetisClip\bootstrap.json` | `{ "data_root": "D:\\MetisClip" }`. Main reads it before mongod starts, so it cannot live in the database. |
| Logs | `%APPDATA%\MetisClip\logs\` | `main.log`, `engine.log`, `render.log`, `mongod.log` (rotating) |
| Updatable tools | `%LOCALAPPDATA%\MetisClip\bin\` | `yt-dlp.exe`, copied from resources on first run, then self-updated |

**Data folder rules** (checked in the wizard and when moving):

- **Local fixed drive only.** Removable, network and mapped drives are rejected, because mongod needs reliable local disk I/O and file locks.
- **Not inside OneDrive, Google Drive or Dropbox.** Sync clients lock and rewrite live database files and can corrupt them. Windows may redirect Documents, Videos or Desktop into OneDrive, so check the resolved path, not the folder name.
- **Free space:** at least 15 GB when chosen. Warn below 5 GB during use, and pause new jobs below 2 GB.
- **Short path** (≤ 60 characters), to stay clear of the 260-character limit with nested library files.
- **Permissions:** when the folder is outside the user profile (e.g. on `D:\`), restrict its ACL to the current Windows user.
- **Moving the data** (Pengaturan → "Pindahkan Lokasi Data"): stop the engine and mongod → copy → verify (file count, total size, mongod starts on the new path) → update `bootstrap.json` → restart. The old folder is deleted only after the user confirms.
- **Missing drive at startup** (external disk unplugged, drive letter changed): show a recovery screen ("Folder data tidak ditemukan") with "Coba lagi" and "Pilih lokasi lain". Never silently create a new, empty database.

### 6.2 MongoDB runtime

- **Server:** MongoDB Community Server at a pinned version. Only `mongod.exe` and its license files are bundled; no mongosh, Compass or database tools.
- **Process:** started by the Electron main process as a child process, not as a Windows service, so no admin rights are needed. Main passes resolved absolute paths:

```
mongod.exe --dbpath "<DATA_ROOT>\db" --bind_ip 127.0.0.1 --port <free port> --auth
           --wiredTigerCacheSizeGB 0.25
           --logpath "<APPDATA>\MetisClip\logs\mongod.log" --logappend
           --setParameter diagnosticDataCollectionEnabled=false
```

- **Memory:** by default WiredTiger takes about half of (RAM − 1 GB), which would starve MediaPipe and the Remotion render on an 8 GB laptop. The cache is capped at 0.25 GB by default (configurable).
- **Port:** a random free port, never 27017, so it cannot clash with a MongoDB the user already runs.
- **Auth:** on first run the engine uses MongoDB's localhost exception to create one user, `metisclip`. MongoDB 8 only lets the localhost exception grant roles defined in the `admin` database, so the user gets `readWriteAnyDatabase`, `dbAdminAnyDatabase`, `hostManager` (graceful `shutdown`) and `clusterManager` (`setFeatureCompatibilityVersion` after a major upgrade), all on `admin`. The server holds nothing but the `metisclip` database. Its 32-byte random password is stored in `<DATA_ROOT>\.metisclip\db-credentials.json`, with the ACL restricted to the current Windows user (`icacls /inheritance:r`). It lives in the data folder, not in Credential Manager, so the database stays usable when the folder is moved, or reused after a reinstall or on a new PC. The engine never serves `.metisclip\` or `db\` over HTTP. If users exist but the file is missing, the engine stops with a fatal error and does not create a new database.
- **Topology:** standalone, with no replica set. This means there are no multi-document transactions and no change streams. Real-time updates come from the engine's WS event bus, and every write is designed as a single-document atomic update (§6.3).
- **Durability:** journaling is always on. A normal quit sends `shutdown`. After a hard kill or power loss, mongod recovers from the journal on the next start; at most the last ~100 ms of writes can be lost, which resumable jobs tolerate.
- **Driver:** PyMongo (sync), one `MongoClient` per engine process, shared by the pipeline worker threads (it is thread-safe). Options: `tz_aware=True`, `uuidRepresentation="standard"`, a short server-selection timeout with retry.
- **Advanced (P2):** power users may enter their own MongoDB connection string; the bundled mongod is then not started.

### 6.3 Collections

Database name: `metisclip`.

- `_id` is a UUID4 **string**, so URLs, the frontend and existing IDs stay unchanged.
- Dates are BSON `Date` in UTC.
- Each collection has a Pydantic model in `backend/models/`, and a `$jsonSchema` validator (`validationLevel: "moderate"`) created by migrations.
- Collection names follow the current Supabase tables, to keep the refactor small. There is no `user_id` or RLS (single local user); data is scoped per `agent_id`.
- Brand templates are a **shared library** of named templates (`brand_templates`), usable by any Super Agent. Each agent has a default template (`default_brand_template_id`) that new clips copy into `clips.brand_template_id`; the clip editor can switch a clip's template. A clip whose template was deleted falls back to its agent's default. There is always at least one template. (Until migration 003 the template was embedded 1:1 in its agent.)

```js
// super_agents: one per niche workspace
{
  _id: "uuid", name: "Podcast Bisnis", niche: "bisnis",
  default_duration: "45-60", timezone: "Asia/Jakarta",
  default_brand_template_id: "uuid",        // template used by this agent's new clips
  created_at: ISODate()
}

// brand_templates: the shared, named template library
{
  _id: "uuid", name: "Podcast gelap",
  brand_settings: { overlayUrl: "asset://library/_brand/<id>/logo-1a2b.png" }, caption_settings: { mode: "popshadow" },
  layout_settings: { safeZone: "tiktok" }, ai_settings: { fillerWords: true },
  created_at: ISODate(), updated_at: ISODate()
}

// discovery_jobs
{
  _id: "uuid", agent_id: "uuid",
  source: { type: "url" | "local_file", youtube_url: "https://www.youtube.com/watch?v=…", local_file_path: null },
  config: { clip_duration: "45-60", max_clips: 3, max_clips_per_video: 3 },
  status: "pending" | "running" | "interrupted" | "cancelled" | "completed" | "failed",
  current_step: "discovery" | "analysis" | "processing",
  progress_pct: 0, total_scenes: 0, processed_scenes: 0,
  checkpoint: { discovery_done: false, analysis_done: false, done_segment_ids: [] },
  errors: [ { step: "analysis", message: "…", at: ISODate() } ],   // capped to the last 50
  created_at: ISODate(), started_at: null, finished_at: null
}

// source_videos
{ _id: "uuid", job_id: "uuid", agent_id: "uuid", youtube_id: "…", title: "…", channel_name: "…",
  duration_seconds: 5400, view_count: 120000, like_count: 4000,
  file_path: null, file_fingerprint: null,   // an upload: youtube_id null, file_path absolute, title = file name
  status: "pending" | "analyzing" | "completed" | "failed", created_at: ISODate() }

// transcripts: cache keyed by video, reused across jobs and on resume
{ _id: "yt:<youtube_id>" | "file:<fingerprint>", source: "youtube" | "whisper", language: "id",
  segments: [ { text: "…", start: 13.6, duration: 4.5 } ], fetched_at: ISODate() }

// clips
{
  _id: "uuid", agent_id: "uuid", job_id: "uuid", source_video_id: "uuid", youtube_id: "…",
  start_time: 754.0, end_time: 799.0, duration_seconds: 45.0,
  viral_score: 87, hook_text: "…", tags: ["quotable"], rationale: "…",
  files: {                                  // relative to DATA_ROOT, forward slashes
    raw: "library/podcast-bisnis/<clip_id>/raw.mp4",
    final: null,
    thumbnail: "library/podcast-bisnis/<clip_id>/thumb.jpg"
  },
  subtitle: { words: [ { word: "Nobody", start: 0.0, end: 0.35, confidence: 0.98, keyword: true, emoji: "🔥" } ] },  // was subtitle_data; keyword/emoji optional
  subtitle_style: {},                       // per-clip override of the template's caption_settings
                                            // (only changed keys); optional `ai` key overrides its ai_settings
  brand_template_id: "uuid",                // the clip's template (missing = its agent's default)
  status: "processing" | "ready" | "rendering" | "exported" | "failed",
  created_at: ISODate(), updated_at: ISODate()
}

// render_jobs
{ _id: "uuid", clip_id: "uuid", status: "queued" | "rendering" | "completed" | "failed" | "cancelled",
  progress_pct: 0, output_path: null, error: null, created_at: ISODate(), finished_at: null }

// app_settings: a single document { _id: "settings", … } (§8.1)
// meta:         { _id: "schema", version: 1, migrated_at: ISODate() }
```

**Indexes**

| Collection | Indexes |
|---|---|
| `discovery_jobs` | `{agent_id: 1, created_at: -1}`, `{status: 1}` |
| `source_videos` | `{job_id: 1}`, `{youtube_id: 1}` |
| `clips` | `{agent_id: 1, created_at: -1}`, `{job_id: 1}`, `{status: 1}`, `{brand_template_id: 1}` |
| `brand_templates` | `{created_at: 1}` |
| `render_jobs` | `{clip_id: 1, created_at: -1}`, `{status: 1}` |

**Write patterns** (standalone server, so no transactions)

- **Progress:** one `update_one` per event, e.g. `{$set: {progress_pct, current_step}, $inc: {processed_scenes: 1}}`.
- **Idempotent clip creation:** the clip `_id` is derived deterministically (`uuid5` of job ID, `youtube_id`, start and end) and written with an upsert, so a resumed job never duplicates clips.
- **Errors:** `$push` with `$slice: -50`, so a job document never grows without bound.
- **Deleting an agent:** remove dependants collection by collection (render jobs → clips → source videos → jobs → agent). A crash part-way is safe to re-run. Library files are deleted only when the user ticks "Hapus file juga". Brand templates are not deleted with an agent.
- **Deleting a brand template:** unset `brand_template_id` on its clips, move agents that used it to the oldest remaining template, then delete the imported asset copies no other template references (only under `library\_brand\`).

### 6.4 Migrations and backups

- **Migrations:** `backend/db/migrations/NNN_name.py`, each with an `up(db)` function. At engine start the runner compares them with `meta.schema.version` and applies the missing ones in order. Forward-only. `001_init` creates the collections, validators and indexes.
- **Backups:** before any migration, and once a day while the app is idle, the engine exports every collection as canonical EJSON (`bson.json_util`), gzipped, to `<DATA_ROOT>\backups\metisclip-YYYYMMDD-HHMM.json.gz`, keeping the last 5. Media files are not included; they are already plain files the user can copy.
- **Restore (P2):** Pengaturan → "Pulihkan dari Backup". After confirmation the engine drops and re-imports the collections.
- **mongod upgrades:** pin one MongoDB major version per app release line. If an app update ships a newer major, it must follow MongoDB's upgrade path: one major at a time, then `setFeatureCompatibilityVersion`. The app takes a backup before swapping binaries, and the engine runs the FCV step after the new mongod starts. Never skip majors.

### 6.5 Existing web data

There is no automatic migration in v1. A one-time importer is only built if D4 says existing web users matter: sign in to Supabase → copy agents, brand templates and clip metadata into MongoDB → download clip files from R2 into the library.

---

## 7. Engine API (localhost)

Base URL: `http://127.0.0.1:{port}`. Every request carries `Authorization: Bearer {token}`; media and WS routes also accept `?token=`. The frontend talks to the engine only through `frontend/lib/engine.ts`.

### System and settings

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Status, version, MongoDB ping |
| GET | `/api/system/check` | ffmpeg, ffprobe, yt-dlp and deno versions; GPU encoders; free disk; RAM; library writable |
| POST | `/api/system/update-ytdlp` | Self-update yt-dlp |
| GET | `/api/system/storage` | Data folder path, free space on its drive, size of `db\`, `library\` and `cache\` (library per agent) |
| POST | `/api/system/backup` | Write an EJSON database backup now (§6.4) |
| GET | `/api/system/backups` | List existing backups |
| GET / PUT | `/api/settings` | Non-secret settings (§8.1) |
| GET | `/api/secrets` | Which secrets are set (booleans only) |
| PUT / DELETE | `/api/secrets/{name}` | Secret storage (keyring) |
| POST | `/api/secrets/{name}/reveal` | The stored value, for the eye icon in Pengaturan and the Setup Wizard |
| POST | `/api/secrets/{name}/test` | Validate a key (cheap LLM call with that provider's model, or a Whisper ping) |
| POST | `/api/llm/models` | Text models a provider offers for a key (`{provider, value?, base_url?}`), for the model picker |
| POST | `/internal/shutdown` | Graceful stop (main process only) |

### Agents and brand

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/agents` | List / create Super Agents |
| PUT / DELETE | `/api/agents/{id}` | Update / delete (confirm in UI; asks whether library files are deleted too) |
| GET / POST | `/api/brand-templates` | List the template library (with usage) / create one (`{name, copy_from?}` duplicates) |
| GET / PUT / DELETE | `/api/brand-templates/{id}` | Name, brand, caption, layout and AI settings; delete (refused for the last template) |
| POST | `/api/brand-templates/{id}/assets` | Import a logo, overlay or sample video into `library\_brand\{id}\` |

### Jobs (pipeline)

| Method | Path | Description |
|---|---|---|
| POST | `/api/jobs` | Create a job from a YouTube link or a video file on this PC (`agent_id`, `youtube_url` or `local_file_path`, `clip_duration`, `max_clips`) |
| GET | `/api/jobs?agent_id=` | List jobs |
| GET | `/api/jobs/{id}` | Detail, progress and errors |
| POST | `/api/jobs/{id}/cancel` | Cancel and kill children |
| POST | `/api/jobs/{id}/resume` | Resume an `interrupted` or `failed` job from its checkpoint |
| DELETE | `/api/jobs/{id}` | Delete the job record (clips are kept) |

### Clips and render

| Method | Path | Description |
|---|---|---|
| GET | `/api/clips?agent_id=&status=` | List clips |
| GET | `/api/clips/{id}` | Detail with subtitle data and the effective style |
| PUT | `/api/clips/{id}/subtitles` | Save `words` (with optional `keyword` / `emoji` marks), `style` (may include the per-clip `ai` override) or `reset_style` |
| POST | `/api/clips/{id}/subtitles/enrich` | Let the LLM (re)mark keywords and/or emojis (`{keywords, emojis}`) |
| GET | `/api/clips/{id}/media/{raw\|final\|thumb}` | Stream with HTTP Range support |
| POST | `/api/clips/{id}/render` | Queue a render, returns `render_job_id` |
| POST | `/api/render-jobs/{id}/cancel` | Cancel a render |
| POST | `/api/clips/export` | Copy one or more `final.mp4` files to a chosen folder |
| DELETE | `/api/clips/{id}` | Delete the record (optionally its files) |

### Dashboard

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard/stats?agent_id=` | Replaces the Next.js `/api/dashboard/stats` route |

### Events

`WS /ws/events?token=` pushes JSON messages:
`{ "type": "job.progress" | "job.status" | "clip.created" | "render.progress" | "render.status" | "system.notice", "id": "...", "progress": 0-100, "step": "...", "message": "..." }`

---

## 8. Configuration and Secrets

### 8.1 Runtime settings (`app_settings` document in MongoDB, shown under Pengaturan)

- The data folder (`data_root`) is **not** stored in MongoDB, because it is needed before mongod starts. It lives in `%APPDATA%\MetisClip\bootstrap.json` and only changes through "Pindahkan Lokasi Data".
- `export_dir`, `cache_limit_gb`
- `db.wiredtiger_cache_gb` (default 0.25, applied on restart)
- `llm.provider`: `openai` | `anthropic` | `gemini` | `xai` | `deepseek` | `qwen` | `openai_compatible` (default; 9Router). The six hosted providers have fixed endpoints in `core/llm_providers.py`.
- `llm.models`: the chosen model per provider, so switching back keeps the earlier choice. Defaults (Nov 2026): `gpt-6.1-terra`, `claude-haiku-5-5`, `gemini-3.6-flash`, `grok-4.3`, `deepseek-flash`, `qwen-plus`, `metisclip` (9Router). Model names change often; the UI loads the live list from the provider ("Muat daftar model").
- `llm.base_url`: only for `openai_compatible` (quick fills: 9Router, Groq, OpenRouter, Together AI, Fireworks AI). Migration 004 turned the old presets (9router, Groq, Custom) into this provider.
- `whisper.provider` (`groq` | `local` in P2), `whisper.model` (default `whisper-large-v3-turbo`)
- `processing.max_workers`, `processing.encoder` (`auto` | `libx264` | `h264_nvenc` | `h264_qsv` | `h264_amf`), `render.concurrency`
- `ytdlp.player_client`, `ytdlp.cookies_file`
- `app.close_to_tray`, `app.auto_update`, `app.language` (`id`)

### 8.2 Secrets (Windows Credential Manager, service name `MetisClip`)

One key per LLM provider: `openai_api_key`, `anthropic_api_key`, `gemini_api_key`, `xai_api_key`, `deepseek_api_key`, `qwen_api_key`, and `llm_api_key` for the OpenAI-compatible endpoint. Plus `groq_api_key` (Whisper). The user enters every key in Pengaturan or the Setup Wizard. **Keys are never read from `.env` or environment variables, not even in dev** (owner decision, 2026-11-09); the dev engine stores them under the service name `MetisClip-Dev`. The MongoDB password is not stored here (see §6.2). They replace `super_agents.groq_api_key`, `.env` keys and Supabase-stored tokens.

### 8.3 Development `.env` (dev only, never bundled)

```env
METISCLIP_ENV=dev                 # enables mock/sandbox fallbacks
METISCLIP_DATA_ROOT=.\.devdata    # dev data folder (db\, library\, cache\, backups\)
MONGODB_URI=mongodb://127.0.0.1:27017/metisclip   # dev mongod without auth; packaged builds use port + keyring
```

No credentials go in `.env`: API keys are entered in the app (§8.2), and the LLM provider, model, base URL and Whisper model live in `app_settings` (§8.1).

**Removed for desktop:** every API key (`LLM_API_KEY`/`NINEROUTER_API_KEY`, `GROQ_API_KEY` and the other providers' keys), `SUPABASE_*`, `JWT_SECRET`, `R2_*`, `REDIS_URL`, `COMPOSIO_API_KEY`, `HOST=0.0.0.0`, `PORT`, `TEMP_DIR`, `CLIP_STORAGE_BUCKET`, `YOUTUBE_OAUTH_CLIENT_ID`/`_SECRET`.

---

## 9. UI / UX (Desktop)

### 9.1 Design system

**`DESIGN.md` is the source of truth.** Since 2026-11-10 it defines a light, soft-organic style in **greens only** (owner decision):

- Every color is a green of the owner's palette hue: canvas `#ECFAE5` (mist), cards `#F9FDF6` (surface), accents `#DDF6D2`, `#CAE8BD`, `#B0DB9C`, green text `#345625`, and ink `#16240F` (a near-black green) for text, the nav rail, primary buttons and the video stage. No white, gray, red, amber or blue: errors use an icon, an ink outline and clear wording.
- **Light theme only.** No emoji in the UI chrome; the subtitle "Emoji AI" marks are video content and stay.
- Outfit for display, Plus Jakarta Sans for text, JetBrains Mono for timecodes.
- Pill-shaped controls and 28 px cards.
- Raw colors live only in `frontend/styles/tokens.css`. Screens are built from the reusable components in `frontend/components/ui` (barrel `index.ts`) and the `mc-` classes in `styles/components.css`; add a missing piece there, not inside a page.

The earlier glassmorphism system (Liquid Blue `#1856FF`, deep-space backgrounds, frosted panels) has been removed. `backdrop-filter` is allowed only on the video overlay controls.

### 9.2 Screens

- **Kept from the web build:** Beranda (dashboard), Cari Video (discover), Hasil Clip (gallery), Clip editor (`/clips/detail?id=`), Brand Template, Pengaturan, Super Agents.
- **Login, register, forgot and reset password:** hidden in v1 unless D1 = account.
- **New: Setup Wizard** (first run):
  1. Welcome and disclaimer
  2. Choose the **data location**: drive and folder for the database and library, validated per §6.1, with free space shown per drive. Choosing an existing MetisClip data folder reuses it (after a reinstall or on a new PC).
  3. Enter the LLM, Groq and YouTube keys, each with a "Tes" button
  4. System check
  5. Create the first Super Agent
- **New: Jobs panel:** running, queued and interrupted jobs (with Resume), and Cancel. Reachable from anywhere through a status-bar indicator.
- **New: System:** dependency versions, MongoDB status, "Update yt-dlp", data folder location and free space, disk usage per agent, cache purge, "Backup sekarang", "Pindahkan Lokasi Data", "Buka folder log".
- **New: About and Update:** version, changelog, update status.

### 9.3 Desktop UX requirements

- Minimum window size 1280×720. The layout adapts to resizing and renders correctly at 100–200 % Windows display scaling. Window size, position and maximized state are remembered.
- Native dialogs for choosing folders and files. "Buka di Explorer" on every clip, job output and log. (P2) drag a clip from the gallery into Explorer or other apps.
- Windows toast notifications when a job or render finishes or fails.
- Skeleton loaders for every async state. Progress comes **only** from WS events, with no simulated progress bars.
- The video player has timeline markers for detected viral segments, and the subtitle preview highlights each word inline.
- Editor shortcuts:
  - Space: play/pause
  - ←/→: step one frame (Shift for 1 s)
  - Ctrl+S: save
  - Ctrl+Z / Ctrl+Y: undo / redo
  - Ctrl+E: export
- An offline banner appears when the network drops. Editing and rendering existing clips keep working.
- Destructive actions use in-app modals (`components/ui/Modal.tsx`), not `window.confirm`.

---

## 10. Packaging and Distribution (Windows)

### 10.1 Build pipeline (`scripts/build-desktop.ps1`)

1. **frontend:** `next build` with `output: 'export'` → `frontend/out/`
2. **render-engine:** `remotion bundle` → `render-engine/build/`; compile `render.ts` → `render.js`; download and pin Chrome Headless Shell.
3. **backend:** `pyinstaller metisclip-engine.spec` (onedir; collect mediapipe models and cv2 data; `--noconsole`) → `backend/dist/metisclip-engine/`
4. **binaries:** `scripts/fetch-binaries.ps1` downloads pinned mongod (only `mongod.exe` and its license files from the MongoDB Community Server zip), ffmpeg/ffprobe, yt-dlp and deno, verifies SHA256, and places them in `desktop/resources/bin/`.
5. **desktop:** `electron-builder --win nsis` → `MetisClip-Setup-{version}.exe` (the artifacts above go in as `extraResources`).

### 10.2 Installer

- NSIS, per-user install to `%LOCALAPPDATA%\Programs\MetisClip`, no admin rights. Creates a Start Menu entry, and an optional desktop shortcut.
- The uninstaller removes the app and logs and empties `<DATA_ROOT>\cache`, then **asks** whether to also delete the data folder (database, library, backups). The default is to keep it; reinstalling and choosing the same folder picks everything up again.
- Target size: installer ≤ 500 MB. Measure it in Phase 1; mediapipe, opencv, Chromium and mongod dominate.

### 10.3 Code signing and SmartScreen

Unsigned installers trigger SmartScreen warnings, and PyInstaller binaries are often flagged as false positives by antivirus.
- Sign the installer, `MetisClip.exe`, `metisclip-engine.exe` and the bundled exes with Authenticode (an OV or EV certificate, or Azure Trusted Signing).
- If a build is flagged, submit it to the Microsoft Defender false-positive portal.

### 10.4 Updates

- **App:** electron-updater with the feed on GitHub Releases or a **custom domain**, never `*.r2.dev`, which is ISP-blocked. Show an "Update tersedia" prompt and install on restart.
- **yt-dlp:** check daily and update into `%LOCALAPPDATA%\MetisClip\bin`, with a manual button under System. YouTube breaks yt-dlp often, so fixes must not wait for an app release.
- **Database:** migrations, EJSON backups and mongod major-version upgrades follow §6.4.

### 10.5 Observability

- Rotating logs in `%APPDATA%\MetisClip\logs`, replacing the root-level `system_pipeline.log` and `export_pipeline.log`. Keys and tokens are redacted.
- "Buka folder log" and "Salin info sistem" buttons for support.
- (P2) Opt-in crash reporting.

---

## 11. Development Commands

```powershell
# One-time setup
python -m venv venv; .\venv\Scripts\activate
pip install -r backend/requirements.txt
cd frontend; npm install; cd ..
cd render-engine; npm install; npx remotion bundle src/index.ts --out-dir build; cd ..
cd desktop; npm install; cd ..
.\scripts\fetch-binaries.ps1                     # mongod / ffmpeg / yt-dlp / deno into desktop\resources\bin

# Dev: mongod (.devdata, no auth) + next dev + engine (uvicorn --reload) + Electron, all together
cd desktop; npm run dev

# MongoDB alone, for engine-only dev (add .devdata/ to .gitignore)
New-Item -ItemType Directory -Force .\.devdata\db | Out-Null
.\desktop\resources\bin\mongod.exe --dbpath .\.devdata\db --bind_ip 127.0.0.1 --port 27017

# Engine alone (API docs at http://127.0.0.1:<port>/docs when METISCLIP_ENV=dev)
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# Tests
pytest backend/tests
cd desktop; npx playwright test

# Production build → desktop\dist\MetisClip-Setup-<version>.exe
.\scripts\build-desktop.ps1
```

---

## 12. Critical Implementation Rules

1. **Never download full videos for clipping.** Use yt-dlp `--download-sections`. A full audio download is allowed only for the Whisper transcript fallback.
2. **All LLM calls go through `core/llm.py`** (the provider and model come from settings: OpenAI, Anthropic, Gemini, xAI, DeepSeek, Qwen or an OpenAI-compatible endpoint, default 9Router). No provider SDK calls or hard-coded endpoints inside nodes; endpoints live in `core/llm_providers.py`. Speech-to-text uses Groq Whisper (local Whisper is P2).
3. **Subtitles are always editable data** (`subtitle_data` JSON). They are burned in only during export.
4. **Preview == render.** Subtitle presets live in one place and are used by both the editor and Remotion.
5. **Local-first.** No clip or video bytes go to cloud storage. The network is used only for AI APIs, YouTube metadata and downloads via yt-dlp, and updates. The app never uploads or posts to social media.
6. **No server secrets in the bundle.** Assume everything shipped is public.
7. **The engine binds 127.0.0.1 only** on a random port and requires the per-launch token on every route, including media and WS.
8. **No CWD-relative paths.** Resolve everything through `core/paths.py` from the `METISCLIP_*` environment variables. User paths contain spaces and may contain non-ASCII characters (e.g. `C:\Users\ASUS VivoBook\…`), so always pass subprocess arguments as a list and never use `shell=True`.
9. **Every subprocess** uses `creationflags=CREATE_NO_WINDOW` on Windows, is registered with its job, and is tree-killed on cancel or quit. Use `core/procs.py` only.
10. **Jobs are idempotent and resumable.** Checkpoint after each node and each finished clip. On startup, `running` becomes `interrupted`.
11. **Real-time progress uses WebSocket events.** No polling and no fake progress.
12. **Jobs start from a YouTube link or an uploaded video file.** YouTube metadata and downloads go through yt-dlp; uploads are used in place (never copied) and cut with ffmpeg. There is no keyword search and no YouTube Data API key (D6).
13. **Mock or sandbox data only when `METISCLIP_ENV=dev`.** Production shows actionable errors in Bahasa Indonesia.
14. **Smart crop uses face tracking** (MediaPipe) with a center-crop fallback, so a clip never fails just because tracking failed.
15. **Never delete user media automatically.** Cache is purged automatically; library files only on explicit user action.
16. **Desktop window minimum 1280×720, HiDPI-correct.** This replaces the old "tablet-responsive editor" rule.
17. **Bundled binaries are pinned and checksum-verified** (mongod, ffmpeg, yt-dlp, deno, Chrome Headless Shell).
18. **All database access goes through `core/db.py`** and the Pydantic models in `backend/models/`. `_id` is a UUID4 string, timestamps are UTC BSON dates, and documents are validated before they are written.
19. **No multi-document transactions** (mongod runs standalone). Every state change is a single-document atomic update (`$set`, `$inc`, `$push` with `$slice`), and documents stay well under the 16 MB limit: never append unbounded logs or events to a document.
20. **Videos and images never go into MongoDB** (no GridFS). Media lives as files under `<DATA_ROOT>`, and documents hold paths relative to it.
21. **mongod is always shut down gracefully when possible**, and the data folder must be on a local fixed drive outside cloud-sync folders (§6.1).

---

## 13. Roadmap and Milestones

### Phase 0: Stabilize (web codebase, before desktop work)

- Fix K1, K2, K6, K7, K16. Rotate the leaked key and untrack the file (K4).
- Add `core/paths.py`, `core/procs.py` and `core/llm.py`, and route the existing code through them (fixes K9, K12).
- Add pytest coverage for analyzer guards, duration enforcement and multi-video processing.
- **Done when:** a keyword job with 2+ source videos produces clips from the correct videos, and tests pass.

### Phase 1: Desktop MVP (local, unsigned dev builds)

- Electron shell, engine sidecar (dev: uvicorn; packaged: PyInstaller), token auth, and `app://` static export.
- Bundled MongoDB: mongod lifecycle, auth, and the collections and indexes from §6. All UI data access moves from Supabase to `lib/engine.ts`. Composio and the Next API routes are removed.
- Local library storage, render worker via Electron-as-Node, bundled fonts, WS progress, Jobs panel with cancel and resume.
- Settings with keyring secrets, and the Setup Wizard including the data-location step.
- **Done when:** on a clean Windows 11 VM with no Python, Node, FFmpeg or MongoDB installed, the unpacked build runs a YouTube link → 3 clips → edit subtitles → export with the data folder on a second drive (e.g. `D:\MetisClip`), shows no console windows, and leaves no orphan processes (including `mongod.exe`) after quit.

### Phase 2: Distribution-ready

- NSIS installer, code signing, auto-update, yt-dlp self-update, rotating logs, the System screen, hardware-encoder detection, EJSON backups, "Pindahkan Lokasi Data", and the recovery screen for a missing data drive.
- **Done when:** a signed installer installs as a non-admin user whose name contains a space, launches in under 8 s to a usable UI on the reference laptop, updates from N to N+1, and uninstalls cleanly.

### Phase 3: Extended (P2)

- Local Whisper (faster-whisper on CPU or CUDA), drag-out of clips, tray/background mode and toasts for long jobs, opt-in crash reporting, optional MCP server toggle.
- Then the open-decision items: account and license, macOS.

The former "Publishing" phase (YouTube OAuth, scheduled uploads) was dropped on 2026-11-09; see D3.

---

## 14. Testing Strategy

- **Unit (pytest):** nodes with mocked LLM, YouTube and Groq responses; analyzer guards (intro ban, critic acceptance window, expand/trim); `paths.py` with spaces and Unicode; `procs.py` cancel and tree-kill.
- **Database (pytest):** a session fixture starts a throwaway `mongod.exe` (the same pinned binary) with a temporary dbPath on a random port. Tests run real queries, indexes and validators instead of a Mongo mock. Migration tests apply every migration to an empty database and to fixtures of the previous schema version.
- **Integration:** full pipeline on a fixed public sample video ID with recorded transcript and LLM fixtures; a render snapshot (frame hash at fixed timestamps for each preset, checking preview == render).
- **E2E (Playwright `_electron`):** first-run wizard → create agent → create job → gallery → edit subtitle → export → file exists → open in Explorer (IPC stubbed).
- **Packaging smoke test** on clean Windows 10 22H2 and Windows 11 VMs: non-admin user whose name contains a space, no dev tools installed. Install → pipeline → uninstall, then verify no leftover processes (including `mongod.exe`) and that only the data folder remains, and only if the user chose to keep it.
- **Resilience:** kill the engine mid-job → it restarts and the job resumes; kill `mongod.exe` mid-write → journal recovery, and no duplicate clips after resume; data folder on `D:\` with the drive removed → recovery screen; drop the network mid-analysis and mid-download; low disk space; yt-dlp failure surfaces the "Update yt-dlp" hint.
- **Performance baseline:** a 60-min source and 3 clips of 45–60 s on the reference laptop (record wall time, peak RAM and CPU) and track regressions per release.

---

## 15. Risks and Open Decisions

### Risks

| Risk | Mitigation |
|---|---|
| **Remotion license:** free for individuals and small teams; for-profit companies above the size threshold need a paid Company License | Verify the current terms before commercial distribution |
| **yt-dlp breakage and YouTube bot checks** ("Sign in to confirm you're not a bot") | Self-update; configurable player client; `cookies.txt` import. Firefox is more reliable for `--cookies-from-browser`, since Chromium browsers on Windows often lock or encrypt cookies. |
| **FFmpeg licensing:** GPL builds with libx264 | Ship ffmpeg as a separate exe with its license and source offer, or use an LGPL build plus hardware encoders. Decide before the public release. |
| **Installer size and antivirus false positives** (PyInstaller, mediapipe) | onedir build, code signing, Defender submission |
| **MongoDB license:** Community Server is under the SSPL, which is not OSI-approved | Shipping the unmodified `mongod.exe` with its license is generally acceptable, but get a legal check before commercial release and include the license text in the installer |
| **mongod footprint:** adds tens of MB to the installer and a resident process with its own RAM use | Cap the WiredTiger cache (0.25 GB default), disable diagnostic data collection, and measure idle RAM in Phase 1 |
| **Platform support:** MongoDB 5.0+ needs an AVX-capable CPU, and recent releases may not officially support Windows 10 | Verify the pinned release's Windows support. If Windows 10 is not supported, pin an older major or raise the minimum to Windows 11. |
| **Antivirus scanning** of `<DATA_ROOT>\db` slows mongod and can lock files | Document how to add a Defender exclusion (needs admin, so the user does it); show a hint when database latency is abnormal |
| **Unclean shutdown** (power loss, killed process) or an orphan mongod holding `mongod.lock` | Journal recovery on the next start; main detects and terminates orphans (§3.3); EJSON backups (§6.4) |
| **Data folder** on a cloud-synced, removable or network drive | Rejected by validation (§6.1); recovery screen when the drive is missing |
| **Weak laptops** (8 GB RAM, integrated GPU) with MediaPipe and Chromium render | Hardware-aware worker defaults; one render at a time; RAM warning |
| **Copyright:** clipping third-party YouTube content | Onboarding disclaimer (the user is responsible for rights and fair use). Backlog: show the source video link in the clip editor so the user can credit it when posting |

### Open decisions (owner: product)

| ID | Question | Default assumed in this document |
|---|---|---|
| **D1** | Account and monetization: (a) no account, (b) Supabase account with subscription check, (c) offline license key | (a) for Phase 1; decide before Phase 2 |
| **D2** | AI keys: BYOK, or MetisClip-provided quota through a cloud proxy (needs a server and billing) | BYOK |
| **D3** | Scheduling and publishing to social media (YouTube, TikTok, Instagram) | **Decided 2026-11-09: removed.** No account connections or uploads in the app; users post exported clips themselves. Revisit only with a server-side relay and API audits. |
| **D4** | Migrate existing web users' data (Supabase/R2 → local MongoDB + files)? | No, unless real users exist |
| **D5** | Keep the web version running in parallel? | Freeze the web version. The engine stays HTTP-based, so a web build could be revived later. |
| **D6** | Keyword search for videos (YouTube Data API) | **Decided 2026-11-09: removed.** The Cari Video page takes a YouTube link (metadata from yt-dlp) or an uploaded video file, so there is no YouTube API key or quota. |
