// How the video sits on the 9:16 canvas (Brand Template "Layout"):
//  - 'full': the face-tracked 9:16 clip (raw.mp4) fills the canvas, as before.
//  - 'podcast': the source video in its own ratio (source.mp4) inside a frame, over a background
//    (the same video blurred, a color, a gradient or an image), with the clip's title above the
//    frame and an optional source credit.
// Pure (no React, no DOM): the clip editor, the Brand Template preview and the Remotion render use
// the same geometry (preview == render). Keep the defaults and limits in sync with
// backend/services/layout.py.
//
// Units are design px of DESIGN_CANVAS (300×533), like the caption position; font sizes use the
// caption's unit (font in design px = fontSize / 2).
import { DESIGN_CANVAS, PLATFORM_LABELS, PLATFORM_UI, PLATFORMS, toDesign, type Platform } from './position';
import { charWidthEm } from './metrics';

export type LayoutMode = 'full' | 'podcast';
export type FrameRatio = 'source' | '16:9' | '4:3' | '1:1' | '4:5';
export type BackgroundType = 'blur' | 'color' | 'gradient' | 'image';
export type HeaderSource = 'title' | 'custom';
export type TextAlign = 'left' | 'center' | 'right';

export interface LayoutFrame {
  /** Top edge of the video frame (design px from the top). */
  y: number;
  ratio: FrameRatio;
  /** Space on the left and right of the frame (design px). */
  margin: number;
  /** Corner radius (design px). */
  radius: number;
  /** Horizontal focus (0 = left, 1 = right) when a fixed ratio crops the video. */
  focusX: number;
}

export interface LayoutBackground {
  type: BackgroundType;
  color: string;
  /** Second gradient color (top → bottom). */
  color2: string;
  /** `asset://…` image (Brand Template asset) for type 'image'. */
  imageUrl: string;
  /** Blur strength (design px) for type 'blur'. */
  blur: number;
  /** Darkening over the background (0–0.9), so the frame and the text stand out. */
  dim: number;
}

export interface LayoutHeader {
  enabled: boolean;
  /** 'title': the clip's title (hook text, editable per clip); 'custom': `text` on every clip. */
  source: HeaderSource;
  text: string;
  fontFamily: string;
  fontWeight: string;
  /** Caption units (font in design px = fontSize / 2). Long titles shrink to fit `maxLines`. */
  fontSize: number;
  color: string;
  /** Box behind the text; '' = none (a soft shadow instead). */
  boxColor: string;
  align: TextAlign;
  isUppercase: boolean;
  /** Space between the title and the frame (design px). */
  gap: number;
  maxLines: number;
}

export interface LayoutCredit {
  enabled: boolean;
  /** `{channel}` is replaced by the YouTube channel; hidden when there is none (uploads). */
  text: string;
  fontSize: number;
  color: string;
}

export interface Layout {
  mode: LayoutMode;
  frame: LayoutFrame;
  background: LayoutBackground;
  header: LayoutHeader;
  credit: LayoutCredit;
}

/** Partial layout as stored (template layout_settings, clip layout_style): sections are partial too. */
export type LayoutPatch = {
  mode?: LayoutMode;
  frame?: Partial<LayoutFrame>;
  background?: Partial<LayoutBackground>;
  header?: Partial<LayoutHeader>;
  credit?: Partial<LayoutCredit>;
};

const W = DESIGN_CANVAS.width;
const H = DESIGN_CANVAS.height;
const SAFE = toDesign({
  top: Math.max(...PLATFORMS.map((p) => PLATFORM_UI[p].top)),
  bottom: Math.max(...PLATFORMS.map((p) => PLATFORM_UI[p].bottom)),
  left: 0,
  right: 0,
});

export const DEFAULT_LAYOUT: Layout = {
  mode: 'full',
  // A 16:9 frame at full width spans y 138–307: the default caption (positionY 190) sits right
  // under it and the title above it, all clear of every platform's UI.
  frame: { y: 138, ratio: 'source', margin: 0, radius: 0, focusX: 0.5 },
  background: { type: 'blur', color: '#000000', color2: '#1E3A2B', imageUrl: '', blur: 12, dim: 0.35 },
  header: {
    enabled: true,
    source: 'title',
    text: '',
    fontFamily: 'Montserrat',
    fontWeight: 'Extra-Bold',
    fontSize: 30,
    color: '#FFFFFF',
    boxColor: '',
    align: 'center',
    isUppercase: false,
    gap: 10,
    maxLines: 3,
  },
  credit: { enabled: false, text: 'Sumber: {channel}', fontSize: 16, color: '#FFFFFF' },
};

/** Numeric limits (also enforced by the engine). */
export const LAYOUT_LIMITS = {
  frameY: { min: 0, max: H - 60 },
  margin: { min: 0, max: 60 },
  radius: { min: 0, max: 40 },
  blur: { min: 0, max: 40 },
  dim: { min: 0, max: 0.9 },
  headerSize: { min: 16, max: 72 },
  headerGap: { min: 0, max: 60 },
  maxLines: { min: 1, max: 4 },
  creditSize: { min: 10, max: 32 },
};

export const MODES: LayoutMode[] = ['full', 'podcast'];
export const RATIO_VALUES: FrameRatio[] = ['source', '16:9', '4:3', '1:1', '4:5'];
export const BACKGROUND_TYPES: BackgroundType[] = ['blur', 'color', 'gradient', 'image'];
const RATIOS: Record<Exclude<FrameRatio, 'source'>, number> = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '4:5': 4 / 5 };
const ALIGNS: TextAlign[] = ['left', 'center', 'right'];
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function num(v: unknown, lim: { min: number; max: number }, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, lim.min, lim.max) : fallback;
}
const color = (v: unknown, fallback: string): string => (typeof v === 'string' && HEX.test(v) ? v : fallback);
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T =>
  values.includes(v as T) ? (v as T) : fallback;
const text = (v: unknown, fallback: string, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Patch over patch: each section merges key by key (template ⊕ clip override). */
export function mergeLayout(...patches: Array<LayoutPatch | Record<string, any> | null | undefined>): LayoutPatch {
  const out: Record<string, any> = {};
  for (const p of patches) {
    if (!p || typeof p !== 'object') continue;
    for (const [k, v] of Object.entries(p)) {
      if (k === 'mode') out.mode = v;
      else if (k === 'frame' || k === 'background' || k === 'header' || k === 'credit') {
        if (v && typeof v === 'object') out[k] = { ...(out[k] || {}), ...v };
      }
    }
  }
  return out as LayoutPatch;
}

/** Complete, valid layout from stored patches (unknown keys dropped, numbers clamped). */
export function resolveLayout(...patches: Array<LayoutPatch | Record<string, any> | null | undefined>): Layout {
  const p = mergeLayout(...patches);
  const d = DEFAULT_LAYOUT;
  const f = p.frame || {};
  const b = p.background || {};
  const h = p.header || {};
  const c = p.credit || {};
  const L = LAYOUT_LIMITS;
  return {
    mode: oneOf(p.mode, MODES, d.mode),
    frame: {
      y: num(f.y, L.frameY, d.frame.y),
      ratio: oneOf(f.ratio, RATIO_VALUES, d.frame.ratio),
      margin: num(f.margin, L.margin, d.frame.margin),
      radius: num(f.radius, L.radius, d.frame.radius),
      focusX: num(f.focusX, { min: 0, max: 1 }, d.frame.focusX),
    },
    background: {
      type: oneOf(b.type, BACKGROUND_TYPES, d.background.type),
      color: color(b.color, d.background.color),
      color2: color(b.color2, d.background.color2),
      imageUrl: text(b.imageUrl, d.background.imageUrl, 1000),
      blur: num(b.blur, L.blur, d.background.blur),
      dim: num(b.dim, L.dim, d.background.dim),
    },
    header: {
      enabled: bool(h.enabled, d.header.enabled),
      source: oneOf(h.source, ['title', 'custom'] as const, d.header.source),
      text: text(h.text, d.header.text),
      fontFamily: text(h.fontFamily, d.header.fontFamily, 80) || d.header.fontFamily,
      fontWeight: text(h.fontWeight, d.header.fontWeight, 40) || d.header.fontWeight,
      fontSize: num(h.fontSize, L.headerSize, d.header.fontSize),
      color: color(h.color, d.header.color),
      boxColor: h.boxColor === '' ? '' : color(h.boxColor, d.header.boxColor),
      align: oneOf(h.align, ALIGNS, d.header.align),
      isUppercase: bool(h.isUppercase, d.header.isUppercase),
      gap: num(h.gap, L.headerGap, d.header.gap),
      maxLines: Math.round(num(h.maxLines, L.maxLines, d.header.maxLines)),
    },
    credit: {
      enabled: bool(c.enabled, d.credit.enabled),
      text: text(c.text, d.credit.text, 80),
      fontSize: num(c.fontSize, L.creditSize, d.credit.fontSize),
      color: color(c.color, d.credit.color),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

/** Width/height of the source video; 16:9 when unknown. */
export function sourceAspect(width?: number | null, height?: number | null): number {
  const w = Number(width);
  const h = Number(height);
  return w > 0 && h > 0 ? w / h : 16 / 9;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The video frame in design px. Full width minus the margins, at the chosen ratio; a frame that would
 * reach into the area the platforms cover at the bottom gets narrower instead (portrait sources).
 */
export function frameRect(layout: Layout, aspect: number): Rect {
  const f = layout.frame;
  const a = f.ratio === 'source' ? (aspect > 0 ? aspect : 16 / 9) : RATIOS[f.ratio];
  let width = W - 2 * f.margin;
  let height = width / a;
  const maxH = Math.max(80, H - SAFE.bottom - f.y);
  if (height > maxH) {
    height = maxH;
    width = height * a;
  }
  return { left: (W - width) / 2, top: f.y, width, height };
}

/** Side padding of the title (design px). */
export const HEADER_SIDE = 24;
export const HEADER_LINE_HEIGHT = 1.15;
/** Box padding around the title, in em of its font. */
export const HEADER_PAD = { x: 0.55, y: 0.3 };
const MIN_SCALE = 0.6;

/** The title shown above the frame ('' = none). */
export function headerText(layout: Layout, title: string | null | undefined): string {
  const h = layout.header;
  if (!h.enabled) return '';
  const raw = (h.source === 'custom' ? h.text : title || '').replace(/\s+/g, ' ').trim();
  return h.isUppercase ? raw.toUpperCase() : raw;
}

function wrap(words: string[], maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if (line.length + 1 + w.length <= maxChars) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Title lines and font scale: greedy word wrap using the font's measured glyph widths, shrinking the
 * font (down to 60 %) until the title fits `maxLines`; past that the last line ends with "…".
 * Lines are rendered as given (no browser wrapping), so every renderer breaks them the same way.
 */
export function headerLines(layout: Layout, value: string): { lines: string[]; scale: number } {
  const h = layout.header;
  if (!value) return { lines: [], scale: 1 };
  const words = value.split(' ').filter(Boolean);
  const cfg = { fontFamily: h.fontFamily, fontWeight: h.fontWeight, isUppercase: h.isUppercase, fontSize: h.fontSize };
  const charEm = charWidthEm(cfg);
  const boxEm = h.boxColor ? 2 * HEADER_PAD.x : 0;
  for (let scale = 1; ; scale = Math.round((scale - 0.05) * 100) / 100) {
    const fontPx = (h.fontSize / 2) * scale;
    const availEm = (W - 2 * HEADER_SIDE) / fontPx - boxEm;
    const maxChars = Math.max(4, Math.floor((availEm * 0.94) / charEm));
    const lines = wrap(words, maxChars);
    if (lines.length <= h.maxLines) return { lines, scale };
    if (scale <= MIN_SCALE) {
      const kept = lines.slice(0, h.maxLines);
      let last = kept[kept.length - 1];
      while (last.length > 1 && last.length + 1 > maxChars) last = last.slice(0, -1);
      kept[kept.length - 1] = last.replace(/[\s.,;:!?-]+$/, '') + '…';
      return { lines: kept, scale };
    }
  }
}

/** Title box in design px (its bottom sits `gap` above the frame), or null without a title. */
export function headerRect(layout: Layout, frame: Rect, lines: string[], scale: number): Rect | null {
  if (!lines.length) return null;
  const h = layout.header;
  const fontPx = (h.fontSize / 2) * scale;
  const height = lines.length * HEADER_LINE_HEIGHT * fontPx + (h.boxColor ? 2 * HEADER_PAD.y * fontPx : 0);
  const bottom = frame.top - h.gap;
  return { left: HEADER_SIDE, top: bottom - height, width: W - 2 * HEADER_SIDE, height };
}

/** Credit text with the channel filled in ('' = hidden). */
export function creditText(layout: Layout, channel: string | null | undefined): string {
  const c = layout.credit;
  if (!c.enabled || !c.text.trim()) return '';
  if (c.text.includes('{channel}')) {
    const ch = (channel || '').trim();
    return ch ? c.text.split('{channel}').join(ch).trim() : '';
  }
  return c.text.trim();
}

/** Platforms whose own UI at the top would cover part of the title. */
export function headerCoveredBy(rect: Rect | null): Platform[] {
  if (!rect) return [];
  return PLATFORMS.filter((p) => rect.top < toDesign(PLATFORM_UI[p]).top - 0.5);
}

export const platformNames = (list: Platform[]): string => list.map((p) => PLATFORM_LABELS[p]).join(', ');

/** Everything a renderer needs for one podcast frame. */
export function podcastGeometry(layout: Layout, aspect: number, title: string | null | undefined, channel?: string | null) {
  const frame = frameRect(layout, aspect);
  const value = headerText(layout, title);
  const { lines, scale } = headerLines(layout, value);
  const header = headerRect(layout, frame, lines, scale);
  return { frame, lines, scale, header, credit: creditText(layout, channel) };
}

/**
 * Caption position (positionY) just under the frame, never lower than the default safe position.
 * `captionHeight` in design px (see position.ts captionHeight).
 */
export function captionUnderFrame(frame: Rect, captionHeight: number, minY: number): number {
  const gap = 6;
  return Math.max(minY, Math.round(H - (frame.top + frame.height) - gap - captionHeight));
}
