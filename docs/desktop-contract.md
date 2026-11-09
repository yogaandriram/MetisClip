# MetisClip Desktop — Integration Contract (Phase 1)

This file pins the interfaces between the four parts of the desktop app so they can be built in parallel:

| Part | Owner dir | Talks to |
|---|---|---|
| Electron main + preload | `desktop/` | spawns **mongod** and the **engine**; serves the UI; exposes `window.metis` |
| Engine (FastAPI) | `backend/` | MongoDB, child processes, the render worker |
| UI (Next.js static export) | `frontend/` | the engine over HTTP/WS, Electron over `window.metis` |
| Render worker (Remotion) | `render-engine/` | started by the engine as a child process |

If anything here conflicts with `CLAUDE.md`, this file wins for Phase 1 (CLAUDE.md is updated afterwards).

---

## 1. Folders and bootstrap

| What | Packaged | Dev (`!app.isPackaged`) |
|---|---|---|
| userData / APPDATA dir | `%APPDATA%\MetisClip` | `%APPDATA%\MetisClip-Dev` (main calls `app.setPath('userData', …)` before `ready`) |
| bootstrap file | `<APPDATA dir>\bootstrap.json` | same |
| logs | `<APPDATA dir>\logs\` (`main.log`, `engine.log`, `mongod.log`, `render.log`) | same |
| binaries (`mongod.exe`, `yt-dlp.exe`, `deno.exe`) | `<resources>\bin\` | `<repo>\desktop\resources\bin\` (filled by `scripts\fetch-binaries.ps1`) |
| engine | `<resources>\engine\metisclip-engine.exe` | `<repo>\venv\Scripts\python.exe -m backend.run` with `cwd = <repo>` |
| render-engine root | `<resources>\render-engine\` | `<repo>\render-engine\` |
| UI | `app://metisclip/` → `<resources>\ui\` (copy of `frontend\out`) | `http://localhost:3000` (`next dev`) |

`bootstrap.json`:

```json
{ "data_root": "D:\\MetisClip", "created_at": "2026-11-09T10:00:00.000Z" }
```

Data root layout (created by main when the folder is chosen; engine re-creates missing subfolders on start):
`db\`, `library\`, `exports\`, `cache\`, `backups\`, `.metisclip\` (engine-private files, e.g. the DB credentials).

**Data root validation** (main, `validateDataRoot`): absolute path; fixed local drive (reject removable/network/mapped via `GetDriveType`, e.g. with `wmic`/PowerShell `Get-Volume` or `fs.statfs` fallback); not under a OneDrive/Dropbox/Google Drive folder (check `process.env.OneDrive`, `OneDriveConsumer`, `OneDriveCommercial`, and path segments `OneDrive`, `Dropbox`, `Google Drive`, `My Drive`); writable (create + delete a temp file); ≥ 15 GB free = ok, < 15 GB = warning, < 2 GB = problem; path length ≤ 60 chars = ok, longer = warning. `existingData` = `true` when `<path>\db\WiredTiger` exists (reuse of an existing data folder).

---

## 2. MongoDB process (owned by Electron main)

Main starts mongod **before** the engine:

```
<bin>\mongod.exe --dbpath "<DATA_ROOT>\db" --bind_ip 127.0.0.1 --port <free port> --auth
                 --wiredTigerCacheSizeGB 0.25
                 --logpath "<APPDATA dir>\logs\mongod.log" --logappend
                 --setParameter diagnosticDataCollectionEnabled=false
```

- Free port: bind a Node `net` server on `127.0.0.1:0`, read the port, close it, pass it to mongod. Retry with a new port up to 3 times if mongod exits early.
- Readiness: TCP connect to `127.0.0.1:<port>` succeeds (poll every 200 ms, timeout 30 s). The engine does the real handshake.
- Orphan recovery: if `<DATA_ROOT>\db\mongod.lock` is non-empty, it contains the PID of a mongod that did not shut down. If that PID is alive **and** its executable path equals our `mongod.exe`, kill it (`taskkill /PID <pid> /T /F`), wait for exit, then start normally. Never kill a mongod with a different executable path.
- Spawn with `windowsHide: true`. Pipe stdout/stderr to `main.log` (mongod logs mainly to `--logpath`).
- Shutdown: see §3.4. If mongod exits unexpectedly while the app runs, main restarts it (max 3 times / 5 min) and keeps the same port if possible; the engine reconnects by itself.

---

## 3. Engine process

### 3.1 Launch

Main spawns the engine **after** mongod is reachable, with `windowsHide: true`, `cwd = <repo>` in dev, and these env vars (in addition to the inherited environment):

| Var | Value |
|---|---|
| `METISCLIP_ENV` | `dev` or `production` |
| `METISCLIP_TOKEN` | 64 hex chars (`crypto.randomBytes(32)`), new per launch |
| `METISCLIP_DATA_ROOT` | absolute data root |
| `METISCLIP_APPDATA_DIR` | absolute userData dir |
| `METISCLIP_BIN_DIR` | absolute bin dir |
| `METISCLIP_MONGO_PORT` | mongod port |
| `METISCLIP_NODE_PATH` | `process.execPath` (Electron, used with `ELECTRON_RUN_AS_NODE=1`) |
| `METISCLIP_RENDER_DIR` | absolute render-engine root |
| `METISCLIP_BROWSER_PATH` | optional: absolute path to Chrome Headless Shell for Remotion (packaged builds) |
| `PYTHONUNBUFFERED` | `1` (dev) |
| `PYTHONIOENCODING` | `utf-8` |

Optional dev-only overrides the engine also honours (not set by main):
`METISCLIP_PORT` (fixed port instead of 0), `MONGODB_URI` (use this connection string instead of port + credentials).

### 3.2 Ready line

The engine binds `127.0.0.1:<METISCLIP_PORT or 0>`. When the HTTP server is accepting connections it writes **exactly one** JSON line to **stdout** and flushes:

```json
{"event":"ready","port":53817,"version":"0.1.0"}
```

Everything else the engine prints goes to stderr / `engine.log`. Main must ignore non-JSON stdout lines. If the engine cannot start it prints `{"event":"fatal","message":"…"}` to stdout and exits with code ≠ 0. Main timeout for the ready line: 60 s (first run creates the DB user and indexes).

### 3.3 HTTP basics

- Base URL `http://127.0.0.1:<port>`.
- Auth on every route except `GET /health`: header `Authorization: Bearer <token>` **or** query `?token=<token>` (used by `<video src>`, `<img src>` and WebSocket).
- CORS: allowed origins `app://metisclip`; additionally `http://localhost:3000` and `http://127.0.0.1:3000` when `METISCLIP_ENV=dev`.
- Errors: FastAPI default JSON `{"detail": "<pesan dalam Bahasa Indonesia>"}`.
- `GET /health` → `{"status":"ok","version":"0.1.0","mongo":true}` (`mongo:false` when the DB ping fails; status stays 200).

### 3.4 Shutdown

1. Main → `POST /internal/shutdown` (with token). Engine replies `{"ok":true}` immediately, then: stops accepting jobs, cancels running jobs (child processes tree-killed, jobs marked `interrupted`), sends MongoDB `shutdown` admin command, exits with code 0.
2. Main waits up to 15 s for both the engine and mongod to exit, then force-kills what is left (`taskkill /PID <pid> /T /F`).
3. If the engine is already dead, main force-kills mongod (journal recovery handles it on next start).

### 3.5 Crash handling (main)

Engine exits unexpectedly → main restarts it (max 3 times in 5 min, backoff 1 s / 3 s / 10 s), with a **new** token and port, then pushes the new engine info to the renderer (`onEngineStatus` with `state:'ready'`). After that, `state:'error'` with a message.

---

## 4. `window.metis` (preload bridge)

TypeScript declaration: `frontend/types/metis.d.ts` (single source of truth; the preload must implement exactly that interface).

Rules:
- `getEngineInfo()` resolves when the engine is ready (it waits if it is still starting), rejects when `state` becomes `'error'`. When there is no data root yet (first run), it waits until `setDataRoot()` has started the engine.
- `setDataRoot(path)` validates again, creates the folder structure, writes `bootstrap.json`, starts mongod + engine, and resolves `{ok:true}` once the engine is ready (or `{ok:false,error}`).
- `openPath` refuses executables/scripts (`.exe .bat .cmd .com .ps1 .vbs .js .msi .lnk .scr`); only existing paths.
- IPC channels are internal to `desktop/`; the UI only uses `window.metis`.

---

## 5. UI delivery

- `frontend/next.config.js`: `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`.
- Packaged: main registers `app` as a privileged scheme (`standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true`) and serves `<resources>\ui\`. Resolution for a request path `p`: `p` ends with `/` → `p + 'index.html'`; else if the file exists → it; else `p + '/index.html'`; else `p + '.html'`; else `404.html`.
- Entry URL: `app://metisclip/` (packaged) or `http://localhost:3000/` (dev). The UI's root page decides between `/setup/` and `/dashboard/`.
- Dynamic clip route: `/clips/detail/?id=<clipId>` (no `[id]` segment in a static export).

---

## 6. Engine API (used by `frontend/lib/engine.ts`)

`frontend/lib/engine.ts` is the source of truth for request/response shapes. The engine must match it exactly. Summary:

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/health` | — | `{status, version, mongo}` |
| GET | `/api/system/info` | — | `SystemInfo` |
| GET | `/api/system/check` | — | `SystemCheck` |
| GET | `/api/system/storage` | — | `StorageInfo` |
| POST | `/api/system/backup` | — | `{backup: BackupInfo}` |
| GET | `/api/system/backups` | — | `{backups: BackupInfo[]}` |
| POST | `/api/system/update-ytdlp` | — | `YtdlpUpdateResult` (409 while a job runs). Runs `yt-dlp -U` on the copy in `%LOCALAPPDATA%\MetisClip\bin` |
| GET | `/api/settings` | — | `{settings: Settings}` |
| PUT | `/api/settings` | `DeepPartial<Settings>` | `{settings: Settings}` |
| GET | `/api/secrets` | — | `{secrets: Record<SecretName, boolean>}` |
| PUT | `/api/secrets/{name}` | `{value}` | `{ok: true}` |
| DELETE | `/api/secrets/{name}` | — | `{ok: true}` |
| POST | `/api/secrets/{name}/test` | `{value?}` (test stored value when omitted) | `{ok, message}` |
| POST | `/api/llm/models` | `{provider: LlmProvider, value?, base_url?}` (unsaved key / base URL from the form; stored ones when omitted) | `{models: string[]}` (text models, newest first), 400 with an Indonesian message on failure |
| GET | `/api/agents` | — | `{agents: Agent[]}` |
| POST | `/api/agents` | `AgentInput` | `{agent: Agent}` |
| PUT | `/api/agents/{id}` | `Partial<AgentInput>` | `{agent: Agent}` |
| DELETE | `/api/agents/{id}` | `?delete_files=true\|false` | `{ok: true}` |
| GET | `/api/brand-templates` | — | `{brand_templates: BrandTemplate[]}` (oldest first, with `used_by_agents` and `clip_count`) |
| POST | `/api/brand-templates` | `{name, copy_from?}` (`copy_from` duplicates that template's settings; asset files are shared) | `{brand_template: BrandTemplate}` |
| GET | `/api/brand-templates/{id}` | — | `{brand_template: BrandTemplate}` |
| PUT | `/api/brand-templates/{id}` | `Partial<BrandTemplateInput>` (`name`, or sections; each section replaces the stored one) | `{brand_template: BrandTemplate}` |
| DELETE | `/api/brand-templates/{id}` | — | `{ok: true}`; 400 for the last template. Its clips fall back to their agent's default, agents using it get the oldest template, and asset copies no other template uses are deleted |
| POST | `/api/brand-templates/{id}/assets` | multipart: `file`, `kind` | `{value: "asset://library/_brand/<template id>/<file>", path}` |
| GET | `/api/files/{relative path}` | `?token=` | file bytes (Range supported), only under the data root |
| GET | `/api/jobs` | `?agent_id=&status=&limit=` | `{jobs: Job[]}` |
| POST | `/api/jobs` | `JobCreate` | `{job: Job}` |
| GET | `/api/jobs/{id}` | — | `{job: Job}` |
| POST | `/api/jobs/{id}/cancel` | — | `{job: Job}` |
| POST | `/api/jobs/{id}/resume` | — | `{job: Job}` |
| DELETE | `/api/jobs/{id}` | — | `{ok: true}` |
| GET | `/api/clips` | `?agent_id=&job_id=&status=` | `{clips: Clip[]}` |
| GET | `/api/clips/{id}` | — | `ClipDetail` |
| PUT | `/api/clips/{id}/subtitles` | `{words?, style?, reset_style?, brand_template_id?}` (`brand_template_id: null` = follow the agent's default) | `{clip: Clip}` |
| DELETE | `/api/clips/{id}` | `?delete_files=true\|false` | `{ok: true}` |
| GET | `/api/clips/{id}/media/{raw\|final\|thumbnail}` | `?token=&v=` | media bytes (Range) |
| POST | `/api/clips/{id}/render` | — | `{render_job: RenderJob}` |
| POST | `/api/clips/export` | `{clip_ids, dest_dir?}` | `{dest_dir, exported: [{clip_id, path}], skipped: [{clip_id, reason}]}` |
| GET | `/api/render-jobs` | `?clip_id=&status=` | `{render_jobs: RenderJob[]}` |
| GET | `/api/render-jobs/{id}` | — | `{render_job: RenderJob}` |
| POST | `/api/render-jobs/{id}/cancel` | — | `{render_job: RenderJob}` |
| GET | `/api/dashboard/stats` | `?agent_id=` | `DashboardStats` |
| WS | `/ws/events` | `?token=` | stream of `EngineEvent` JSON messages |
| POST | `/internal/shutdown` | — | `{ok: true}` |

### Asset values

Brand settings fields that point at files (`overlayUrl`, `introUrl`, `musicUrl`, `sampleVideoUrl`, and any future `*Url`) store **`asset://<path relative to DATA_ROOT>`**, never an http URL (ports and tokens change every launch). The UI turns them into URLs with `resolveAsset()`; the engine does the same when building render props.

---

## 7. Render worker (owned by `render-engine/`)

Started by the engine (cancel = tree-kill):

```
<METISCLIP_NODE_PATH> <RENDER_DIR>\dist\render.js --props <props.json> --out <out.mp4>
    [--bundle <RENDER_DIR>\build] [--browser <chrome-headless-shell.exe>] [--concurrency <n>] [--gl angle]
env: ELECTRON_RUN_AS_NODE=1 (when METISCLIP_NODE_PATH is Electron)
```

When `METISCLIP_NODE_PATH` is not set (engine run standalone in dev), the engine uses `node` from `PATH`.

- `props.json` = `{ "videoUrl": "http://127.0.0.1:<port>/api/clips/<id>/media/raw?token=…", "words": [...], "style": {...}, "brandSettings": {... asset values already resolved to http URLs ...}, "durationInFrames": <int> }`
- Composition id `SubtitleOverlay`, 1080×1920, 30 fps (unchanged).
- stdout: **JSON lines only**
  - `{"type":"progress","stage":"preparing"|"rendering"|"encoding","progress":0.42}` (0–1, overall)
  - `{"type":"done","output":"<absolute out path>"}`
  - `{"type":"error","message":"…"}`
- Exit code 0 on success, 1 on error. Logs/diagnostics go to stderr.
- Must work fully offline: fonts are bundled locally (no Google Fonts requests).

---

## 8. Dev workflow

```powershell
.\scripts\fetch-binaries.ps1          # once
cd desktop; npm install; npm run dev  # starts next dev (frontend) + Electron; Electron starts mongod + engine
```

Engine alone (UI in a normal browser): run a dev mongod, then

```powershell
$env:METISCLIP_ENV='dev'; $env:METISCLIP_PORT='8000'; $env:METISCLIP_TOKEN='dev-token'
$env:METISCLIP_DATA_ROOT="$PWD\.devdata"; $env:MONGODB_URI='mongodb://127.0.0.1:27017/metisclip'
.\venv\Scripts\python.exe -m backend.run
```

and set `NEXT_PUBLIC_ENGINE_URL=http://127.0.0.1:8000`, `NEXT_PUBLIC_ENGINE_TOKEN=dev-token` for `next dev`.
