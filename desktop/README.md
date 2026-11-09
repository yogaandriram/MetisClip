# MetisClip Desktop (Electron shell)

Electron main + preload for MetisClip. Main starts the bundled **mongod**, then the **engine**
(FastAPI sidecar), serves the UI and exposes `window.metis` (contract: `docs/desktop-contract.md`,
types: `frontend/types/metis.d.ts`).

```
src/main/index.ts         lifecycle, single-instance lock, window (min 1280×720, state remembered), error page, quit
src/main/paths.ts         packaged vs dev folders, engine command, Chrome Headless Shell lookup
src/main/protocol.ts      app://metisclip/ → <resources>\ui (Next.js static export) + CSP
src/main/mongod.ts        mongod start/ready/restart/orphan-lock recovery/force stop
src/main/engine.ts        engine sidecar + Backend state machine (idle/starting/ready/restarting/error/stopped)
src/main/data-root.ts     bootstrap.json, validateDataRoot, data folder structure
src/main/ipc.ts           IPC handlers behind window.metis (sender-origin checked)
src/main/logger.ts        <userData>\logs\main.log (5 MB × 3 rotation, token redaction)
src/main/window-state.ts  window size/position/maximized
src/main/procs.ts         free port, TCP probe, taskkill /T, exe path of a PID
src/preload/index.ts      contextBridge → window.metis (sandboxed preload)
```

TypeScript is compiled with plain `tsc` to `dist-main/` (no bundler).

## Dev

Prerequisites (once): `python -m venv venv; pip install -r backend\requirements.txt`, `.\scripts\fetch-binaries.ps1`,
`npm install` in `frontend\`, `render-engine\` and `desktop\`.

```powershell
cd desktop
npm run dev       # tsc -w + `next dev` (port 3000) + Electron (waits for :3000)
npm start         # tsc + Electron only (expects next dev already running on :3000)
```

In dev, Electron uses `%APPDATA%\MetisClip-Dev` as userData, loads `http://localhost:3000`, runs the
engine as `<repo>\venv\Scripts\python.exe -m backend.run` (cwd = repo) and mongod from
`desktop\resources\bin`. DevTools: F12 / Ctrl+Shift+I (dev only). Logs: `%APPDATA%\MetisClip-Dev\logs\`.

## Build

```powershell
.\scripts\build-desktop.ps1          # NSIS installer → desktop\dist\MetisClip-Setup-<version>.exe
.\scripts\build-desktop.ps1 -Pack    # unpacked app → desktop\dist\win-unpacked\MetisClip.exe
# faster re-pack: -NoInstall (keep node_modules), -SkipFrontend (keep frontend\out), -SkipEngine (keep backend\dist)
```

Packaged layout (`<resources>` = `MetisClip\resources`):

| Path | Content |
|---|---|
| `app.asar` | `dist-main` + package.json |
| `ui\` | `frontend\out` (served on `app://metisclip/`) |
| `engine\metisclip-engine.exe` | PyInstaller onedir engine |
| `render-engine\dist\render.js` | render worker |
| `render-engine\build\` | prebuilt Remotion bundle |
| `render-engine\node_modules\` | production deps (`@remotion/renderer`, compositor-win32-x64-msvc, react) |
| `render-engine\browser\chrome-headless-shell.exe` | Chrome Headless Shell (passed as `METISCLIP_BROWSER_PATH`) |
| `bin\` | `mongod.exe` (+ licenses), `yt-dlp.exe`, `deno.exe`, `ffmpeg.exe` |

The NSIS installer is per-user by default (no admin), never deletes `%APPDATA%\MetisClip` or the data folder.

## Environment hooks (verification / tests)

All are read by the main process and logged to `main.log` when used.

| Variable | Effect |
|---|---|
| `METISCLIP_SCREENSHOT=<file.png>` | After the first page load (+ delay) saves a PNG of the window |
| `METISCLIP_SCREENSHOT_DELAY_MS` | Delay before the screenshot (default 5000) |
| `METISCLIP_SCREENSHOT_ROUTE=/dashboard/` | Navigate to this route before taking the screenshot |
| `METISCLIP_AUTOQUIT_MS=<ms>` | Graceful quit after N ms (waits for a pending screenshot) |
| `METISCLIP_DATA_ROOT_OVERRIDE=<dir>` | Use this data folder; `bootstrap.json` is neither read nor written |
| `METISCLIP_UI_DIR=<dir>` | Serve this static folder on `app://metisclip/` (e.g. `..\frontend\out` in dev) |
| `METISCLIP_DEV_URL` | Dev UI URL (default `http://localhost:3000`) |
| `METISCLIP_USERDATA_DIR=<dir>` | Isolated userData instead of `%APPDATA%\MetisClip(-Dev)` (first-run / E2E tests) |
| `METISCLIP_ENGINE_CMD`, `METISCLIP_ENGINE_ARGS` (JSON array) | Dev only: run a different engine command (e.g. a stub) |
| `METISCLIP_DEVTOOLS=1` | Dev only: open DevTools on start |
| `METISCLIP_DEBUG=1` | Debug lines in `main.log` (e.g. non-JSON engine stdout) |

Example (packaged-like UI, real engine, throwaway data, screenshot, auto quit):

```powershell
cd desktop
$env:METISCLIP_UI_DIR = "..\frontend\out"
$env:METISCLIP_DATA_ROOT_OVERRIDE = "$env:TEMP\metis-e2e"
$env:METISCLIP_SCREENSHOT = "$env:TEMP\metis.png"; $env:METISCLIP_SCREENSHOT_ROUTE = '/dashboard/'
$env:METISCLIP_AUTOQUIT_MS = '20000'
.\node_modules\electron\dist\electron.exe .
```

## Notes

- Children are spawned with Node's `child_process`, which on Windows places them in libuv's
  kill-on-close job object: if Electron itself crashes, mongod and the engine die with it.
  `taskkill /T /F` is still used as the last resort on quit.
- mongod with `--auth` can only be shut down gracefully by the engine (it owns the DB credentials);
  main force-kills mongod only when the engine is gone or did not stop it within 15 s.
- The CSP allows `http://127.0.0.1:*` / `ws://127.0.0.1:*` because the engine port changes per
  launch and on engine restart.
