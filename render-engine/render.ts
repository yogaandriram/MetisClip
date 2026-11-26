/*
 * MetisClip render worker (docs/desktop-contract.md §7).
 *
 *   <node|MetisClip.exe> dist/render.js --props <props.json> --out <out.mp4>
 *       [--bundle <dir>] [--browser <chrome-headless-shell.exe>] [--concurrency <n|50%>] [--gl angle]
 *       [--media-cache-mb <n>] [--encoder-threads <n>] [--crf <n>] [--scale <0.25-1>] [--jpeg-quality <n>]
 *   (--crf, --scale and --jpeg-quality: the export quality Pengaturan picks, backend/services/render.py)
 *   env: ELECTRON_RUN_AS_NODE=1 when the executable is Electron.
 *
 * stdout carries JSON lines ONLY:
 *   {"type":"progress","stage":"preparing"|"rendering"|"encoding","progress":0-1}
 *   {"type":"done","output":"<abs path>"}
 *   {"type":"error","message":"..."}
 * Everything else (Remotion logs, browser console) goes to stderr. Exit code 0 = success, 1 = error.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Memory guard (8 GB laptops). Remotion's defaults are about half the CPU threads as
 * parallel Chrome tabs and an OffthreadVideo frame cache of up to half the free RAM, which can push the
 * machine into memory pressure. Cap both. The engine sizes each render to the RAM free when it starts
 * (backend/core/resources.py) and passes --concurrency, --media-cache-mb and --encoder-threads.
 *
 * Measured 2026-11-15 (60 s clip, 1080x1920, i5-13500H): about 2.7 GB for the render itself (the x264
 * stitcher about 0.9 GB with its default threads, the frame cache 0.5 GB, Chrome's own processes)
 * plus about 0.3-0.5 GB per Chrome tab: 3.2 GB with 1 tab, 3.6 GB with 2, 4.2 GB with 4.
 */
const DEFAULT_MEDIA_CACHE_MB = 512;
const GB = 1024 ** 3;

function defaultConcurrency(): number {
  const threads = os.cpus().length || 2;
  // ~0.4 GB per 1080x1920 tab on top of ~2.7 GB, keeping 2 GB free for the UI, mongod and the pipeline
  const byMemory = Math.floor(Math.max(0, os.freemem() / GB - 2 - 2.7) / 0.4);
  return Math.max(1, Math.min(4, Math.floor(threads / 2), byMemory));
}

/** Caps the threads of the pre-stitcher ffmpeg (the x264 encode of the frames), which lowers its RAM. */
function withEncoderThreads(threads: number | null) {
  if (!threads) return undefined;
  return ({ type, args }: { type: 'pre-stitcher' | 'stitcher'; args: string[] }): string[] => {
    if (type !== 'pre-stitcher') return args;
    const at = args.lastIndexOf('-y'); // [...input and encoder args, '-y', output]
    if (at < 0) return args;
    return [...args.slice(0, at), '-threads', String(threads), ...args.slice(at)];
  };
}

// Keep stdout clean for the engine: route every console method to stderr before Remotion loads.
const toStderr = (...args: unknown[]) => {
  process.stderr.write(args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' ') + '\n');
};
console.log = toStderr;
console.info = toStderr;
console.warn = toStderr;
console.debug = toStderr;

function safeJson(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

type Stage = 'preparing' | 'rendering' | 'encoding';

function emit(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

let lastStage: Stage | null = null;
let lastProgress = -1;
let lastEmitAt = 0;
function progress(stage: Stage, value: number, force = false): void {
  const p = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const now = Date.now();
  if (force && stage === lastStage && p === lastProgress) return;
  if (!force && stage === lastStage && (p - lastProgress < 0.01 || now - lastEmitAt < 200) && p < 1) return;
  lastStage = stage;
  lastProgress = p;
  lastEmitAt = now;
  emit({ type: 'progress', stage, progress: Math.round(p * 1000) / 1000 });
}

let failed = false;
function fail(err: unknown): never {
  if (!failed) {
    failed = true;
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[render] ${err instanceof Error && err.stack ? err.stack : message}\n`);
    emit({ type: 'error', message });
  }
  process.exit(1);
}

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

interface Args {
  props: string;
  out: string;
  bundle: string;
  browser: string | null;
  concurrency: number | string | null;
  gl: string;
  mediaCacheMb: number;
  encoderThreads: number | null;
  crf: number;
  scale: number;
  jpegQuality: number;
}

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Argumen tidak dikenal: ${a}`);
    const eq = a.indexOf('=');
    if (eq > 0) {
      map.set(a.slice(2, eq), a.slice(eq + 1));
    } else {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`Argumen ${a} butuh nilai`);
      map.set(a.slice(2), v);
      i++;
    }
  }
  const known = new Set(['props', 'out', 'bundle', 'browser', 'concurrency', 'gl', 'media-cache-mb', 'encoder-threads', 'crf', 'scale', 'jpeg-quality']);
  for (const k of map.keys()) if (!known.has(k)) throw new Error(`Argumen tidak dikenal: --${k}`);
  if (!map.get('props')) throw new Error('Argumen --props wajib diisi');
  if (!map.get('out')) throw new Error('Argumen --out wajib diisi');

  let concurrency: number | string | null = null;
  const c = map.get('concurrency');
  if (c) concurrency = /^\d+$/.test(c) ? Number(c) : c; // number or "50%"
  const positive = (name: string): number | null => {
    const v = map.get(name);
    if (v === undefined) return null;
    if (!/^\d+$/.test(v) || Number(v) < 1) throw new Error(`Argumen --${name} harus bilangan bulat positif`);
    return Number(v);
  };
  const ranged = (name: string, min: number, max: number, fallback: number): number => {
    const v = map.get(name);
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Argumen --${name} harus angka ${min}-${max}`);
    return n;
  };

  return {
    props: path.resolve(map.get('props')!),
    out: path.resolve(map.get('out')!),
    bundle: path.resolve(map.get('bundle') || path.join(ROOT, 'build')),
    browser: map.get('browser') || null,
    concurrency,
    gl: map.get('gl') || 'angle',
    mediaCacheMb: positive('media-cache-mb') ?? DEFAULT_MEDIA_CACHE_MB,
    encoderThreads: positive('encoder-threads'),
    crf: Math.round(ranged('crf', 1, 51, 18)),
    scale: ranged('scale', 0.25, 1, 1),
    jpegQuality: Math.round(ranged('jpeg-quality', 50, 100, 90)),
  };
}

/** Chrome Headless Shell: --browser, METISCLIP_BROWSER_PATH, packaged layout, dev download location. */
function resolveBrowser(explicit: string | null): string | null {
  const candidates = [
    explicit,
    process.env.METISCLIP_BROWSER_PATH,
    path.join(ROOT, 'browser', 'chrome-headless-shell.exe'),
    path.join(ROOT, 'node_modules', '.remotion', 'chrome-headless-shell', 'win64', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return path.resolve(c);
  }
  if (explicit) throw new Error(`Browser tidak ditemukan: ${explicit}`);
  return null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  progress('preparing', 0, true);

  if (!fs.existsSync(path.join(args.bundle, 'index.html'))) {
    throw new Error(`Bundle Remotion tidak ditemukan di ${args.bundle} (jalankan "npm run build" di render-engine)`);
  }
  const raw = fs.readFileSync(args.props, 'utf8').replace(/^﻿/, '');
  const inputProps = JSON.parse(raw) as Record<string, unknown>;
  if (typeof inputProps.videoUrl !== 'string' || !inputProps.videoUrl) throw new Error('props.videoUrl kosong');
  if (!Array.isArray(inputProps.words)) inputProps.words = [];
  if (!inputProps.style || typeof inputProps.style !== 'object') inputProps.style = {};
  if (!inputProps.brandSettings || typeof inputProps.brandSettings !== 'object') inputProps.brandSettings = {};

  const browserExecutable = resolveBrowser(args.browser);
  if (!browserExecutable) {
    process.stderr.write('[render] Chrome Headless Shell tidak ditemukan; Remotion akan mencoba mengunduhnya (butuh internet)\n');
  } else {
    process.stderr.write(`[render] browser: ${browserExecutable}\n`);
  }
  fs.mkdirSync(path.dirname(args.out), { recursive: true });

  // Loaded after the console redirect so Remotion's own logging goes to stderr.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { selectComposition, renderMedia, makeCancelSignal } = require('@remotion/renderer') as typeof import('@remotion/renderer');

  const chromiumOptions = { gl: args.gl as 'angle' };
  const { cancelSignal, cancel } = makeCancelSignal();
  const onSignal = () => {
    process.stderr.write('[render] dibatalkan\n');
    cancel();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const concurrency = args.concurrency ?? defaultConcurrency();
  const mediaCacheBytes = args.mediaCacheMb * 1024 * 1024;
  process.stderr.write(
    `[render] concurrency ${concurrency}, media cache ${args.mediaCacheMb} MB, encoder threads ${args.encoderThreads ?? 'auto'}, crf ${args.crf}, scale ${args.scale}, free RAM ${(os.freemem() / GB).toFixed(1)} GB\n`,
  );

  const composition = await selectComposition({
    serveUrl: args.bundle,
    id: 'SubtitleOverlay',
    inputProps,
    browserExecutable,
    chromiumOptions,
    offthreadVideoCacheSizeInBytes: mediaCacheBytes,
    logLevel: 'warn',
    onBrowserDownload: () => {
      process.stderr.write('[render] mengunduh Chrome Headless Shell...\n');
      return { version: null, onProgress: () => undefined };
    },
  });
  process.stderr.write(
    `[render] composition ${composition.id} ${composition.width}x${composition.height} @${composition.fps}fps, ${composition.durationInFrames} frames\n`,
  );
  progress('preparing', 0.02, true);

  await renderMedia({
    composition,
    serveUrl: args.bundle,
    codec: 'h264',
    crf: args.crf,
    // "Hemat": 2/3 of the composition's size (1080x1920 -> 720x1280), fewer pixels to capture and encode
    scale: args.scale,
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    imageFormat: 'jpeg',
    jpegQuality: args.jpegQuality,
    audioCodec: 'aac',
    audioBitrate: '192k',
    outputLocation: args.out,
    overwrite: true,
    inputProps,
    browserExecutable,
    chromiumOptions,
    concurrency,
    offthreadVideoCacheSizeInBytes: mediaCacheBytes,
    mediaCacheSizeInBytes: mediaCacheBytes,
    ffmpegOverride: withEncoderThreads(args.encoderThreads),
    cancelSignal,
    logLevel: 'warn',
    timeoutInMilliseconds: 120000,
    onBrowserLog: (log) => process.stderr.write(`[browser:${log.type}] ${log.text}\n`),
    onProgress: ({ progress: p, renderedDoneIn, stitchStage }) => {
      const stage: Stage = renderedDoneIn === null && stitchStage !== 'muxing' ? 'rendering' : 'encoding';
      progress(stage, p);
    },
  });

  if (!fs.existsSync(args.out) || fs.statSync(args.out).size === 0) throw new Error('File hasil render tidak terbentuk');
  progress('encoding', 1, true);
  // The output frame of the chosen cover and the kept frames (calculateMetadata): the engine takes the
  // cover from the video, now or for a cover chosen later without another render
  const { coverFrame, keptFrames } = composition.props as { coverFrame?: unknown; keptFrames?: unknown };
  emit({
    type: 'done',
    output: args.out,
    cover_frame: typeof coverFrame === 'number' ? coverFrame : null,
    frames: Array.isArray(keptFrames) ? keptFrames : null,
    total_frames: composition.durationInFrames,
  });
}

main().then(
  () => process.exit(0),
  (err) => fail(err),
);
