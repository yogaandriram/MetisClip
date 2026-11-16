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
| UI preferences | `<APPDATA dir>\preferences.json`: `{"language": "id"}` or `"en"`, written by main | same |
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
| `METISCLIP_LANG` | UI language for the engine's own messages, `id` or `en` (from `preferences.json`; `backend/core/i18n.py`) |

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
- `language` is the UI language saved in `preferences.json` (`'id'` by default), read synchronously when the window loads. `setLanguage(lang)` saves it, and main forwards it to a running engine with `PUT /api/settings {"app": {"language": lang}}`. Main uses it for its own error page, dialog titles, data-root problems and warnings, and engine status messages.
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
| GET | `/api/system/resources` | — | `ResourceStatus`: total and available RAM, the reserve, and the heavy steps the RAM guard runs or holds back. The same shape is pushed as the `system.resources` event whenever a step starts, waits or ends |
| POST | `/api/system/backup` | — | `{backup: BackupInfo}` |
| GET | `/api/system/backups` | — | `{backups: BackupInfo[]}` |
| POST | `/api/system/update-ytdlp` | — | `YtdlpUpdateResult` (409 while a job runs). Runs `yt-dlp -U` on the copy in `%LOCALAPPDATA%\MetisClip\bin` |
| GET | `/api/settings` | — | `{settings: Settings}` |
| PUT | `/api/settings` | `DeepPartial<Settings>` | `{settings: Settings}` |
| GET | `/api/secrets` | — | `{secrets: Record<SecretName, boolean>}` |
| PUT | `/api/secrets/{name}` | `{value}` | `{ok: true}` |
| DELETE | `/api/secrets/{name}` | — | `{ok: true}` |
| POST | `/api/secrets/{name}/test` | `{value?}` (test stored value when omitted) | `{ok, message}` |
| POST | `/api/secrets/{name}/reveal` | — | `{value}` (404 when not set; `Cache-Control: no-store`). Only called when the user clicks the eye icon |
| POST | `/api/llm/models` | `{provider: LlmProvider, value?, base_url?}` (unsaved key / base URL from the form; stored ones when omitted) | `{models: string[]}` (text models, newest first), 400 with an Indonesian message on failure |
| GET | `/api/agents` | — | `{agents: Agent[]}` |
| POST | `/api/agents` | `AgentInput` | `{agent: Agent}` |
| PUT | `/api/agents/{id}` | `Partial<AgentInput>` | `{agent: Agent}` |
| DELETE | `/api/agents/{id}` | `?delete_files=true\|false` | `{ok: true}` |
| GET | `/api/brand-templates` | — | `{brand_templates: BrandTemplate[]}` (oldest first, with `used_by_agents` and `clip_count`) |
| POST | `/api/brand-templates` | `{name, copy_from?}` (`copy_from` duplicates that template's settings; asset files are shared) | `{brand_template: BrandTemplate}` |
| GET | `/api/brand-templates/{id}` | — | `{brand_template: BrandTemplate}` |
| PUT | `/api/brand-templates/{id}` | `Partial<BrandTemplateInput>` (`name`, or sections; each section replaces the stored one). `layout_settings` is validated (see "Layout" below): unknown keys are dropped, numbers clamped, a wrong type is a 400 | `{brand_template: BrandTemplate}` |
| DELETE | `/api/brand-templates/{id}` | — | `{ok: true}`; 400 for the last template. Its clips fall back to their agent's default, agents using it get the oldest template, and asset copies no other template uses are deleted |
| POST | `/api/brand-templates/{id}/assets` | multipart: `file`, `kind` | `{value: "asset://library/_brand/<template id>/<file>", path}`. `kind: "companion"` (MP4, MOV or WEBM) is converted first (silent, 30 fps, short side ≤ 1080 px, first 180 s) and also returns `duration`; 400 with an Indonesian message when it is not a readable video |
| GET | `/api/campaigns` | `?status=active\|archived` | `{campaigns: Campaign[]}` (newest change first, with `clip_count`, `exported_count` and `source_count`; without `sources` and `draft`) |
| POST | `/api/campaigns` | `{name, client?, brand_template_id?, brief?}` | `{campaign: Campaign}` |
| GET | `/api/campaigns/{id}` | — | `{campaign: Campaign}` |
| PUT | `/api/campaigns/{id}` | `CampaignInput` (`brief` = a reviewed brief: replaces the stored one, `version` + 1 when it differs, and clears `draft`) | `{campaign: Campaign}` |
| DELETE | `/api/campaigns/{id}` | — | `{ok: true}`. Its clips stay without a campaign; `library/_campaigns/<id>/` is deleted |
| POST | `/api/campaigns/{id}/sources/text` | `{text, name?}` | `{campaign: Campaign}` |
| POST | `/api/campaigns/{id}/sources/file` | multipart: `file` (PDF, DOCX, TXT, MD, PNG, JPG, WEBP, BMP, GIF; ≤ 25 MB) | `{campaign: Campaign}`: the file is kept in `library/_campaigns/<id>/` and its text read at once (scanned PDF pages become PNGs); 400 with a message in the UI language for `.doc`, other types or an unreadable file |
| DELETE | `/api/campaigns/{id}/sources/{source id}` | — | `{campaign: Campaign}` |
| POST | `/api/campaigns/{id}/parse` | — | `{campaign: Campaign}` with `parse.status: "running"`; the LLM reads every piece in the background (images: the pictures themselves for a model that accepts them, else their Windows OCR text). `campaign.parse` events report `running`, `done` (result in `draft`) or `failed` (`message`). 400 without an LLM key, 409 while a read runs |
| POST | `/api/campaigns/{id}/draft/discard` | — | `{campaign: Campaign}`; 400 without a draft |
| GET | `/api/files/{relative path}` | `?token=` | file bytes (Range supported), only under the data root |
| GET | `/api/jobs` | `?agent_id=&status=&limit=` | `{jobs: Job[]}` |
| POST | `/api/jobs` | `JobCreate` (`clip_duration`: a preset or a custom `lo-hi` of 10–180 s, at least 5 apart; `campaign_ids`: up to 5 active campaigns, each brief snapshotted into the job; `note`) | `{job: Job}` |
| GET | `/api/jobs/{id}` | — | `{job: Job}` |
| POST | `/api/jobs/{id}/cancel` | — | `{job: Job}` |
| POST | `/api/jobs/{id}/resume` | — | `{job: Job}` |
| DELETE | `/api/jobs/{id}` | — | `{ok: true}` |
| GET | `/api/clips` | `?agent_id=&job_id=&status=&campaign_id=` | `{clips: Clip[]}`; campaign clips also carry `campaign_name` and `brief_summary` |
| GET | `/api/clips/{id}` | — | `ClipDetail` (with `campaign` and `brief_check`, null without a campaign) |
| PUT | `/api/clips/{id}/post-copy` | `{title, caption, hashtags, mentions, disclosure}` | `{clip: Clip}` (`post_copy.source: "edited"`) |
| POST | `/api/clips/{id}/post-copy/generate` | — | `{clip: Clip}`: the post text written again by the LLM from the campaign's current brief; 400 without a campaign or LLM key, 502 on an LLM error |
| PUT | `/api/clips/{id}/brief-manual` | `{rule, checked}` | `{clip: Clip, brief_check}`; 400 for a rule the brief does not have |
| PUT | `/api/clips/{id}/campaign` | `{campaign_id: string \| null}` | `{clip: Clip}` |
| PUT | `/api/clips/{id}/subtitles` | `{words?, style?, reset_style?, layout?, reset_layout?, hook_text?, brand_template_id?}` (`brand_template_id: null` = follow the agent's default; `layout` replaces the clip's `layout_style` override; `hook_text` is the title the podcast layout shows) | `{clip: Clip}` |
| DELETE | `/api/clips/{id}` | `?delete_files=true\|false` | `{ok: true}` |
| GET | `/api/clips/{id}/media/{raw\|final\|thumbnail\|source}` | `?token=&v=` | media bytes (Range); `source` = the clip in the source video's own ratio (404 for clips made before it was kept) |
| POST | `/api/clips/{id}/source` | — | `{clip: Clip}`: fetches the original-ratio video again for an older clip (yt-dlp section of its exact edges, or a cut of the uploaded file); 400 with an Indonesian message when it cannot |
| POST | `/api/clips/{id}/faces` | — | `{clip: Clip, scenes: SceneData}`: the face scan for an older clip (its `source.mp4` first when that is missing too), kept as `files.faces`; 400 with an Indonesian message when it cannot |
| POST | `/api/clips/{id}/speaker/suggest` | — | `{speakers: [{name, role}]}`: up to 3 names for the speaker tag from the video title, the channel and the clip's words; only names whose words all appear there are returned. Not saved. 400 without a title or words, or without an LLM key; 502 on an LLM error |
| POST | `/api/clips/{id}/render` | — | `{render_job: RenderJob}` (see "Render output" below) |
| POST | `/api/clips/export` | `{clip_ids, dest_dir?}` (`dest_dir` empty = the export folder) | `{dest_dir, exported: [{clip_id, path}], skipped: [{clip_id, reason}]}`. A campaign clip with post text also gets `<same name>.txt` (UTF-8) next to the video while `settings.export.post_text` is on (default) |
| GET | `/api/render-jobs` | `?clip_id=&status=` | `{render_jobs: RenderJob[]}` |
| GET | `/api/render-jobs/{id}` | — | `{render_job: RenderJob}` |
| POST | `/api/render-jobs/{id}/cancel` | — | `{render_job: RenderJob}` |
| GET | `/api/dashboard/stats` | `?agent_id=` | `DashboardStats` |
| WS | `/ws/events` | `?token=` | stream of `EngineEvent` JSON messages |
| POST | `/internal/shutdown` | — | `{ok: true}` |

### Render output

A finished render is written to `<clip dir>\final.mp4` (`output_path`) and then copied to the export folder (`settings.export_dir`, default `<DATA_ROOT>\exports`) as `<hook text> - <clip id, 8 chars>.mp4`. A re-render of the same clip replaces that copy. `RenderJob` and the completed `render.status` event carry:

- `output_path`: the file in the library
- `exported_path`: the copy in the export folder (null when the copy failed)
- `export_dir`: the export folder used
- `export_error`: why the copy failed (Indonesian). The render still counts as `completed`, and the editor offers to copy again.

`/api/clips/export` uses the same file name. Neither accepts the data folder itself, `db\`, `cache\` or `.metisclip\` as destination ("Folder tujuan tidak diizinkan").

### Layout (podcast, card, split, duo and auto modes, zoom, speaker tag)

The Brand Template "Layout" section (`layout_settings`, next to the preview-only `safeZone`) and a clip's override (`layout_style`) are patches of the layout model in `frontend/lib/presets/layout.ts`; `backend/services/layout.py` validates them with the same enums and limits:

- `mode`: `full` (default: the face-tracked raw.mp4 fills 9:16), `podcast` (the clip's `source.mp4` in its own ratio inside a frame) `card` (`source.mp4` inside a social-post card) `split` (raw.mp4 over a looping companion video), `duo` (in shots with two people side by side, one panel per person cropped from `source.mp4` around their face; raw.mp4 full-frame in every other shot) or `auto` (a view per shot of the face scan, see `auto`).
- `frame`: `y` (top edge, design px of the 300×533 canvas), `ratio` (`source`, `16:9`, `4:3`, `1:1`, `4:5`), `margin`, `radius`, `focusX` (0–1).
- `background`: `type` (`blur`, `color`, `gradient`, `image`), `color`, `color2`, `imageUrl` (`asset://…`), `blur`, `dim` (0–0.9).
- `header`: `enabled`, `source` (`title` = the clip's `hook_text`, `custom` = `text`), `text`, `fontFamily`, `fontWeight`, `fontSize` (caption units), `color`, `boxColor` (`''` = none), `align`, `isUppercase`, `gap`, `maxLines` (1–4).
- `credit`: `enabled`, `text` (`{channel}` = the YouTube channel; hidden for uploads), `fontSize`, `color`. Drawn in the video's bottom-right corner, top-right in card mode, in split and duo mode in the top part's corner next to the seam, and in auto mode in the frame's corner in framed scenes and next to the seam in the others.
- `card`: `name`, `handle` (the user's own account; the top row is hidden while both are empty), `avatarUrl` (`asset://…`; '' = first letter), `color`, `textColor`, `mutedColor`, `margin`, `radius`. The post text is the header (title) with the header's font, size and lines; `frame.y` places the card, `frame.ratio` / `focusX` / `radius` shape its video.
- `zoom`: `enabled`, `style` (`keywords` = punch-in on AI keywords, `sentences` = every other sentence), `amount` (0.05–0.3).
- `speaker`: `enabled`, `name`, `role` (usually set per clip), `fontFamily`, `fontSize`, `y`, `align` (`left`, `center`), `start`, `duration` (seconds of clip time), `color`, `textColor`, `accent`, `accentText`. Hidden while `name` is empty.
- `companion` (split mode): `videoUrl` (`asset://…` from an upload with `kind: "companion"`), `duration` (seconds, from that upload), `position` (`bottom` = companion below the speaker, `top`), `split` (0.35–0.65, the speaker part's share of the height), `focusY` (0–1, vertical focus of the speaker video), `divider` (0–8 design px), `dividerColor`. A split render without `videoUrl`, or with its file missing, fails with "Layout video pendamping belum punya video. …" or "File video pendamping tidak ditemukan …".
- `duo` (duo mode): `top` (`left` or `right`: which person of the source goes in the top panel), `split` (0.35–0.65, the top panel's share of the height), `faceSize` (0.15–0.5, face height as a share of its panel; the source is never scaled up more than 2.2×), `divider` (0–8 design px, drawn only in two-speaker shots), `dividerColor`. Also used by the auto mode's two-panel scenes.
- `auto` (auto mode): the view for each kind of shot. `solo` (one person), `group` (three or more, or two too close to split) and `none` (no face: slides, screen recordings, B-roll) take `full` (raw.mp4) or `framed` (`source.mp4` in the podcast frame, with `frame`, `background` and `header`); `duo` (two people side by side) takes `duo` (the two panels), `full` or `framed`. Defaults: `{solo: "full", duo: "duo", group: "framed", none: "framed"}`. The view changes only at camera cuts; a two-speaker shot under 0.8 s counts as a group, and any other scene under 1 s takes the view of the scene before it (or after it, at the start) unless that one is two panels.

Effective layout = template ⊕ clip, merged per section (`GET /api/clips/{id}` returns it as `effective_layout`, with `channel`). Every new clip keeps `files.source` (`<clip dir>\source.mp4`, same timeline as raw.mp4) and `source_width` / `source_height`. A podcast or card render of a clip without one first prepares it ("Menyiapkan video sumber…" in `render.progress.message`); if that fails, the render fails with "Layout podcast butuh video sumber: …" (or "Layout kartu …").

New clips also keep their face scan, `files.faces` (`<clip dir>\faces.json`, same timeline): the faces MediaPipe found about 5 times a second and the camera-cut candidates (`backend/agents/tools/faces.py`). `GET /api/clips/{id}` returns `scenes` = `{width, height, shots: [{start, end, kind, faces}]}`, or `null` before the scan: every shot of the clip, `kind` one of `duo`, `solo`, `group`, `none`, and `faces` `{x, y, h}` as fractions of the source frame (`[left, right]` in a duo shot). The layout model turns them into the views (`scenePlan` in `layout.ts`). A duo or auto render of a clip without a scan first runs it ("Menganalisis wajah…"); if that fails, the render fails with "Layout dua pembicara butuh analisis wajah: …" (or "Layout otomatis …"). The render props carry the same `scenes` object.

### Asset values

Brand settings fields that point at files (`overlayUrl`, `sampleVideoUrl`, the layout's `background.imageUrl`, and any future `*Url`) store **`asset://<path relative to DATA_ROOT>`**, never an http URL (ports and tokens change every launch). The UI turns them into URLs with `resolveAsset()`; the engine does the same when building render props.

---

## 7. Render worker (owned by `render-engine/`)

Started by the engine (cancel = tree-kill):

```
<METISCLIP_NODE_PATH> <RENDER_DIR>\dist\render.js --props <props.json> --out <out.mp4>
    [--bundle <RENDER_DIR>\build] [--browser <chrome-headless-shell.exe>] [--concurrency <n>] [--gl angle]
    [--media-cache-mb <n>] [--encoder-threads <n>]
env: ELECTRON_RUN_AS_NODE=1 (when METISCLIP_NODE_PATH is Electron)
```

With "Hemat RAM otomatis" on (`resources.auto`, the default), the engine sizes every render with the RAM guard (`backend/core/resources.py`):
- It waits until about 2.5 GB can be spared.
- It then passes `--concurrency` (the Chrome tabs that fit in the RAM, 1 to 4), `--encoder-threads 4` and `--media-cache-mb 256`.
- It starts the worker at below-normal priority; Chrome and ffmpeg inherit it.
- While the render waits, its `render.progress` events carry a `message` ("Menunggu RAM: …").

With the guard off, none of these flags are passed and the worker sizes itself from the free RAM.

When `METISCLIP_NODE_PATH` is not set (engine run standalone in dev), the engine uses `node` from `PATH`.

- `props.json` = `{ "videoUrl": "http://127.0.0.1:<port>/api/clips/<id>/media/raw?token=…", "words": [...], "style": {...}, "brandSettings": {... asset values already resolved to http URLs ...}, "ai": {...}, "durationInFrames": <int>, "layout": {... effective layout, asset values resolved ...}, "title": "<hook text>" }`, plus `"clipId"`, for a podcast, card, duo or auto layout `"sourceUrl"` (`media/source`), `"sourceAspect"` (width / height) and `"channel"`, and for a duo or auto layout `"scenes"` (the clip's shots, see Layout). Without `sourceUrl` the composition renders the full 9:16 layout.
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
