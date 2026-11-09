# MetisClip render engine (Remotion)

Burns animated subtitles + brand overlay into a clip. The composition (`src/`) is bundled once at
build time; the engine renders by starting the worker `dist/render.js` (docs/desktop-contract.md §7).

```powershell
npm install
npm run build        # remotion bundle → build\  +  tsc render.ts → dist\render.js
npm start            # Remotion Studio (for working on the composition)
npm run gen:fonts    # regenerate src\fonts.ts after SUPPORTED_FONTS changes
```

## Worker

```
<node | MetisClip.exe with ELECTRON_RUN_AS_NODE=1> dist/render.js --props <props.json> --out <out.mp4>
    [--bundle <dir, default build\>] [--browser <chrome-headless-shell.exe>] [--concurrency <n|50%>] [--gl angle]
```

- `props.json`: `{ videoUrl, words, style, brandSettings, durationInFrames }` (`videoUrl` = engine media URL with token).
- stdout = JSON lines only: `progress` (`preparing` / `rendering` / `encoding`, 0–1), then `done` or `error`. Exit 0 / 1.
- Output: H.264 CRF 18, yuv420p BT.709, AAC 192k, 1080×1920 @ 30 fps.
- Chrome Headless Shell lookup: `--browser`, `METISCLIP_BROWSER_PATH`, `<root>\browser\chrome-headless-shell.exe`
  (packaged), `node_modules\.remotion\chrome-headless-shell\…` (dev, `npm run browser:ensure`).

## Rules

- Presets are imported from `../frontend/lib/presets` (preview == render, never fork them).
  `remotion.config.ts` aliases `react`/`react-dom` to this package so the bundle has one React copy;
  both packages use React 18.
- Fonts are bundled from static `@fontsource/*` packages (`src/fonts.ts`, latin subset, all upright
  weights) — no Google Fonts at render time, works offline. `Courier New` is a Windows system font.
- Video is drawn with `<OffthreadVideo>` (frame-exact extraction by the Remotion compositor).
- The bundle's public dir is `static/` (kept empty); `public/` is legacy and not bundled.
