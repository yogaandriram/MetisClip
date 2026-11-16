// How the video sits on the 9:16 canvas (Brand Template "Layout"):
//  - 'full': the face-tracked 9:16 clip (raw.mp4) fills the canvas, as before.
//  - 'podcast': the source video in its own ratio (source.mp4) inside a frame, over a background
//    (the same video blurred, a color, a gradient or an image), with the clip's title above the
//    frame and an optional source credit.
//  - 'card': the source video inside a social-post style card (avatar, account name and handle, the
//    title as the post text, then the video), over the same backgrounds.
//  - 'split': the face-tracked clip (raw.mp4) on one part of the canvas and a silent companion video
//    (gameplay, satisfying footage, the user's own B-roll; a Brand Template asset) looping on the
//    other part. Each clip starts the loop at its own point.
//  - 'duo': two speakers sitting side by side in the source picture, one above the other, each in
//    its own panel cropped from source.mp4 around their face (the clip's face scan, faces.json). In
//    shots without two speakers (a close-up, a wide shot) the clip shows full-frame like 'full'.
//  - 'auto': a view per shot of the face scan, chosen by what the shot shows (`auto`): one person
//    full-frame, two people as the duo panels, a group or no face (slides, screen recordings) in the
//    podcast frame. The view changes only at camera cuts, where the picture changes anyway.
// Every mode can add a dynamic zoom (punch-in on AI keywords or every other sentence) and a speaker
// name tag (lower third) shown for a few seconds.
// Pure (no React, no DOM): the clip editor, the Brand Template preview and the Remotion render use
// the same geometry and timing (preview == render). Keep the defaults and limits in sync with
// backend/services/layout.py.
//
// Units are design px of DESIGN_CANVAS (300×533), like the caption position; font sizes use the
// caption's unit (font in design px = fontSize / 2). Times are seconds of the source clip.
import { DESIGN_CANVAS, PLATFORM_LABELS, PLATFORM_UI, PLATFORMS, toDesign, type Platform } from './position';
import { charWidthEm } from './metrics';
import { isFiller } from './captions';
import { Ease, interpolate } from './anim';
import type { CaptionWord } from './types';

export type LayoutMode = 'full' | 'podcast' | 'card' | 'split' | 'duo' | 'auto';
export type FrameRatio = 'source' | '16:9' | '4:3' | '1:1' | '4:5';
export type BackgroundType = 'blur' | 'color' | 'gradient' | 'image';
export type HeaderSource = 'title' | 'custom';
export type TextAlign = 'left' | 'center' | 'right';
export type ZoomStyle = 'keywords' | 'sentences';
export type SpeakerAlign = 'left' | 'center';
export type CompanionPosition = 'bottom' | 'top';
export type DuoTop = 'left' | 'right';
/** What a shot shows (face scan): two people side by side, one person, a group, or no face. */
export type SceneKind = 'duo' | 'solo' | 'group' | 'none';
/** How a scene is shown: the face-tracked clip full-frame, the two duo panels, or the podcast frame. */
export type SceneView = 'full' | 'duo' | 'framed';

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

/** The post card ('card' mode). The post text uses the header settings (font, size, lines). */
export interface LayoutCard {
  /** Account name and handle in the card's top row; the row is hidden when both are empty. */
  name: string;
  handle: string;
  /** `asset://…` avatar image; '' = the first letter of the name in a circle. */
  avatarUrl: string;
  /** Card, text, and secondary text (handle) colors. */
  color: string;
  textColor: string;
  mutedColor: string;
  /** Space on the left and right of the card (design px). */
  margin: number;
  radius: number;
}

/** Dynamic zoom on the main video. */
export interface LayoutZoom {
  enabled: boolean;
  /** 'keywords': a smooth punch-in on every AI keyword; 'sentences': every other sentence zoomed in. */
  style: ZoomStyle;
  /** Extra scale at the peak (0.12 = 112 %). */
  amount: number;
}

/** Speaker name tag (lower third). The name is usually set per clip in the editor. */
export interface LayoutSpeaker {
  enabled: boolean;
  name: string;
  /** Second line (job, role); '' = name only. */
  role: string;
  fontFamily: string;
  /** Caption units of the name (font in design px = fontSize / 2); the role is 75 % of it. */
  fontSize: number;
  /** Top edge (design px). */
  y: number;
  align: SpeakerAlign;
  /** When the tag appears and how long it stays (seconds of the clip). */
  start: number;
  duration: number;
  /** Name box and text, role box and text. */
  color: string;
  textColor: string;
  accent: string;
  accentText: string;
}

/** The companion video ('split' mode). */
export interface LayoutCompanion {
  /** `asset://…` video, normalized by the engine on import (silent, 30 fps); '' = none yet. */
  videoUrl: string;
  /** Its length in seconds (set by the engine on import); the loop and each clip's start use it. */
  duration: number;
  /** Where the companion goes; the speaker takes the other part. */
  position: CompanionPosition;
  /** Share of the canvas height for the speaker part. */
  split: number;
  /** Vertical focus of the speaker video in its part (0 = top, 1 = bottom). */
  focusY: number;
  /** Line between the two parts (design px; 0 = none) and its color. */
  divider: number;
  dividerColor: string;
}

/** Two speakers ('duo' mode). */
export interface LayoutDuo {
  /** Which speaker of the source picture (the left or the right one) goes in the top panel. */
  top: DuoTop;
  /** Share of the canvas height for the top panel. */
  split: number;
  /** Face height as a share of its panel's height: the crop zooms to it (up to DUO_MAX_UPSCALE). */
  faceSize: number;
  /** Line between the panels (design px; 0 = none) and its color. */
  divider: number;
  dividerColor: string;
}

/** Automatic layout ('auto' mode): the view for each kind of shot. Panels need two people. */
export interface LayoutAuto {
  solo: 'full' | 'framed';
  duo: SceneView;
  group: 'full' | 'framed';
  none: 'full' | 'framed';
}

export interface Layout {
  mode: LayoutMode;
  frame: LayoutFrame;
  background: LayoutBackground;
  header: LayoutHeader;
  credit: LayoutCredit;
  card: LayoutCard;
  zoom: LayoutZoom;
  speaker: LayoutSpeaker;
  companion: LayoutCompanion;
  duo: LayoutDuo;
  auto: LayoutAuto;
}

/** Partial layout as stored (template layout_settings, clip layout_style): sections are partial too. */
export type LayoutPatch = {
  mode?: LayoutMode;
  frame?: Partial<LayoutFrame>;
  background?: Partial<LayoutBackground>;
  header?: Partial<LayoutHeader>;
  credit?: Partial<LayoutCredit>;
  card?: Partial<LayoutCard>;
  zoom?: Partial<LayoutZoom>;
  speaker?: Partial<LayoutSpeaker>;
  companion?: Partial<LayoutCompanion>;
  duo?: Partial<LayoutDuo>;
  auto?: Partial<LayoutAuto>;
};

const SECTIONS = ['frame', 'background', 'header', 'credit', 'card', 'zoom', 'speaker', 'companion', 'duo', 'auto'] as const;

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
  card: {
    name: '',
    handle: '',
    avatarUrl: '',
    color: '#FFFFFF',
    textColor: '#111418',
    mutedColor: '#5B6670',
    margin: 16,
    radius: 18,
  },
  zoom: { enabled: false, style: 'keywords', amount: 0.12 },
  // Just above the default caption (its top edge sits near y 312), clear of TikTok's left UI
  speaker: {
    enabled: false,
    name: '',
    role: '',
    fontFamily: 'Montserrat',
    fontSize: 24,
    y: 262,
    align: 'left',
    start: 0.3,
    duration: 4,
    color: '#FFFFFF',
    textColor: '#111111',
    accent: '#FACC15',
    accentText: '#111111',
  },
  // Speaker on top, a little below the eyes (raw.mp4 is a 9:16 crop: its middle band shows the face)
  companion: { videoUrl: '', duration: 0, position: 'bottom', split: 0.5, focusY: 0.35, divider: 0, dividerColor: '#000000' },
  // A face 30 % of its panel's height: a podcast face (~15 % of a 1080p frame) shown about 1.8x
  duo: { top: 'left', split: 0.5, faceSize: 0.3, divider: 0, dividerColor: '#000000' },
  // A 9:16 crop suits one person; a group or a slide would be cut, so it goes in the frame whole
  auto: { solo: 'full', duo: 'duo', group: 'framed', none: 'framed' },
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
  zoomAmount: { min: 0.05, max: 0.3 },
  speakerSize: { min: 14, max: 48 },
  speakerY: { min: 0, max: H - 30 },
  speakerStart: { min: 0, max: 30 },
  speakerDuration: { min: 1, max: 30 },
  split: { min: 0.35, max: 0.65 },
  divider: { min: 0, max: 8 },
  companionDuration: { min: 0, max: 600 },
  faceSize: { min: 0.15, max: 0.5 },
};

export const MODES: LayoutMode[] = ['full', 'podcast', 'card', 'split', 'duo', 'auto'];
export const SCENE_VIEWS: SceneView[] = ['full', 'duo', 'framed'];
const FULL_OR_FRAMED = ['full', 'framed'] as const;
export const RATIO_VALUES: FrameRatio[] = ['source', '16:9', '4:3', '1:1', '4:5'];
export const BACKGROUND_TYPES: BackgroundType[] = ['blur', 'color', 'gradient', 'image'];
export const ZOOM_STYLES: ZoomStyle[] = ['keywords', 'sentences'];

/** Podcast and card show the original-ratio source (source.mp4); full shows raw.mp4. */
export const usesSource = (mode: LayoutMode): boolean => mode === 'podcast' || mode === 'card';
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
      else if ((SECTIONS as readonly string[]).includes(k)) {
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
  const k = p.card || {};
  const z = p.zoom || {};
  const s = p.speaker || {};
  const m = p.companion || {};
  const u = p.duo || {};
  const a = p.auto || {};
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
    card: {
      name: text(k.name, d.card.name, 60),
      handle: text(k.handle, d.card.handle, 40),
      avatarUrl: text(k.avatarUrl, d.card.avatarUrl, 1000),
      color: color(k.color, d.card.color),
      textColor: color(k.textColor, d.card.textColor),
      mutedColor: color(k.mutedColor, d.card.mutedColor),
      margin: num(k.margin, L.margin, d.card.margin),
      radius: num(k.radius, L.radius, d.card.radius),
    },
    zoom: {
      enabled: bool(z.enabled, d.zoom.enabled),
      style: oneOf(z.style, ZOOM_STYLES, d.zoom.style),
      amount: num(z.amount, L.zoomAmount, d.zoom.amount),
    },
    speaker: {
      enabled: bool(s.enabled, d.speaker.enabled),
      name: text(s.name, d.speaker.name, 60),
      role: text(s.role, d.speaker.role, 60),
      fontFamily: text(s.fontFamily, d.speaker.fontFamily, 80) || d.speaker.fontFamily,
      fontSize: num(s.fontSize, L.speakerSize, d.speaker.fontSize),
      y: num(s.y, L.speakerY, d.speaker.y),
      align: oneOf(s.align, ['left', 'center'] as const, d.speaker.align),
      start: num(s.start, L.speakerStart, d.speaker.start),
      duration: num(s.duration, L.speakerDuration, d.speaker.duration),
      color: color(s.color, d.speaker.color),
      textColor: color(s.textColor, d.speaker.textColor),
      accent: color(s.accent, d.speaker.accent),
      accentText: color(s.accentText, d.speaker.accentText),
    },
    companion: {
      videoUrl: text(m.videoUrl, d.companion.videoUrl, 1000),
      duration: num(m.duration, L.companionDuration, d.companion.duration),
      position: oneOf(m.position, ['bottom', 'top'] as const, d.companion.position),
      split: num(m.split, L.split, d.companion.split),
      focusY: num(m.focusY, { min: 0, max: 1 }, d.companion.focusY),
      divider: num(m.divider, L.divider, d.companion.divider),
      dividerColor: color(m.dividerColor, d.companion.dividerColor),
    },
    duo: {
      top: oneOf(u.top, ['left', 'right'] as const, d.duo.top),
      split: num(u.split, L.split, d.duo.split),
      faceSize: num(u.faceSize, L.faceSize, d.duo.faceSize),
      divider: num(u.divider, L.divider, d.duo.divider),
      dividerColor: color(u.dividerColor, d.duo.dividerColor),
    },
    auto: {
      solo: oneOf(a.solo, FULL_OR_FRAMED, d.auto.solo),
      duo: oneOf(a.duo, SCENE_VIEWS, d.auto.duo),
      group: oneOf(a.group, FULL_OR_FRAMED, d.auto.group),
      none: oneOf(a.none, FULL_OR_FRAMED, d.auto.none),
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
export function headerLines(
  layout: Layout,
  value: string,
  width = W - 2 * HEADER_SIDE,
  boxed = !!layout.header.boxColor,
): { lines: string[]; scale: number } {
  const h = layout.header;
  if (!value) return { lines: [], scale: 1 };
  const words = value.split(' ').filter(Boolean);
  const cfg = { fontFamily: h.fontFamily, fontWeight: h.fontWeight, isUppercase: h.isUppercase, fontSize: h.fontSize };
  const charEm = charWidthEm(cfg);
  const boxEm = boxed ? 2 * HEADER_PAD.x : 0;
  for (let scale = 1; ; scale = Math.round((scale - 0.05) * 100) / 100) {
    const fontPx = (h.fontSize / 2) * scale;
    const availEm = width / fontPx - boxEm;
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

// ---------------------------------------------------------------------------------------------
// Card ('card' mode)
// ---------------------------------------------------------------------------------------------

/** Inner spacing of the card (design px). */
export const CARD = {
  pad: 14,
  /** Avatar diameter; also the height of the top row. */
  avatar: 30,
  /** Space between the row, the text and the video. */
  gap: 10,
  /** Gap between the avatar and the name. */
  nameGap: 8,
  nameSize: 12,
  handleSize: 10.5,
  lineHeight: 1.3,
};

export interface CardGeometry {
  card: Rect;
  /** Top row (avatar, name, handle), relative to the card; null when there is no name or handle. */
  row: Rect | null;
  /** Post text lines, font scale and box (relative to the card). */
  lines: string[];
  scale: number;
  text: Rect | null;
  /** Video, relative to the card. */
  video: Rect;
  credit: string;
}

/**
 * The card in design px: top row, post text (the title, wrapped like the podcast header but inside the
 * card), then the video at its ratio. A card that would reach into the area the platforms cover at
 * the bottom moves up (not above the top UI area unless placed there); if it still does not fit, its
 * video gets smaller.
 */
export function cardGeometry(layout: Layout, aspect: number, title: string | null | undefined, channel?: string | null): CardGeometry {
  const c = layout.card;
  const f = layout.frame;
  const a = f.ratio === 'source' ? (aspect > 0 ? aspect : 16 / 9) : RATIOS[f.ratio];
  const width = W - 2 * c.margin;
  const inner = width - 2 * CARD.pad;
  const hasRow = !!(c.name.trim() || c.handle.trim());
  const { lines, scale } = headerLines(layout, headerText(layout, title), inner, false);
  const fontPx = (layout.header.fontSize / 2) * scale;
  const textH = lines.length ? lines.length * CARD.lineHeight * fontPx : 0;
  const fixed = 2 * CARD.pad + (hasRow ? CARD.avatar + CARD.gap : 0) + (textH ? textH + CARD.gap : 0);

  let videoW = inner;
  let videoH = inner / a;
  const limit = H - SAFE.bottom;
  const floor = Math.min(f.y, SAFE.top);
  let top = f.y;
  if (top + fixed + videoH > limit) top = Math.max(floor, limit - fixed - videoH);
  if (top + fixed + videoH > limit) {
    videoH = Math.max(60, limit - top - fixed);
    videoW = Math.min(inner, videoH * a);
  }
  const height = fixed + videoH;
  let y = CARD.pad;
  const row = hasRow ? { left: CARD.pad, top: y, width: inner, height: CARD.avatar } : null;
  if (row) y += CARD.avatar + CARD.gap;
  const text = textH ? { left: CARD.pad, top: y, width: inner, height: textH } : null;
  if (text) y += textH + CARD.gap;
  return {
    card: { left: c.margin, top, width, height },
    row,
    lines,
    scale,
    text,
    video: { left: CARD.pad + (inner - videoW) / 2, top: y, width: videoW, height: videoH },
    credit: creditText(layout, channel),
  };
}

// ---------------------------------------------------------------------------------------------
// Companion video ('split' mode)
// ---------------------------------------------------------------------------------------------

export interface SplitGeometry {
  /** The speaker part (raw.mp4) and the companion part, full width. */
  speaker: Rect;
  companion: Rect;
  /** y of the line between them, and the line itself (null without a divider). */
  seam: number;
  divider: Rect | null;
}

/** Two full-width parts: `share` of the height for the first one, on top or at the bottom. */
function stackParts(share: number, firstOnTop: boolean, divider: number) {
  const firstH = Math.round(H * share * 100) / 100;
  const seam = firstOnTop ? firstH : H - firstH;
  return {
    first: { left: 0, top: firstOnTop ? 0 : seam, width: W, height: firstH },
    second: { left: 0, top: firstOnTop ? seam : 0, width: W, height: H - firstH },
    seam,
    divider: divider > 0 ? { left: 0, top: seam - divider / 2, width: W, height: divider } : null,
  };
}

export function splitGeometry(layout: Layout): SplitGeometry {
  const c = layout.companion;
  const g = stackParts(c.split, c.position === 'bottom', c.divider);
  return { speaker: g.first, companion: g.second, seam: g.seam, divider: g.divider };
}

/**
 * Where a clip starts the companion loop (seconds): a fixed point picked from the clip's id, so the
 * clips of one video do not all show the same footage, and the preview and the render agree.
 */
export function companionStart(key: string | null | undefined, duration: number): number {
  if (!key || !(duration > 1)) return 0;
  let hash = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return Math.floor((hash / 0x100000000) * duration * 30) / 30;
}

/** Companion time (seconds) at output time `t`: the loop from the clip's start point. */
export function companionTime(start: number, duration: number, t: number): number {
  if (!(duration > 0)) return 0;
  return (((start + t) % duration) + duration) % duration;
}

// ---------------------------------------------------------------------------------------------
// Scenes: two speakers ('duo') and the automatic layout ('auto'), from the clip's face scan
// ---------------------------------------------------------------------------------------------

/** A face in the source picture: center and height as fractions of the frame. */
export interface DuoFace {
  x: number;
  y: number;
  h: number;
}

/**
 * A shot of the clip from its face scan (source time, seconds). kind: 'duo' (two people side by side;
 * faces = [left, right]), 'solo' (one; faces = [it]), 'group' (more, or two too close or too small to
 * crop apart) or 'none' (no face: slides, screen recordings, B-roll).
 */
export interface Shot {
  start: number;
  end: number;
  kind: SceneKind;
  faces: DuoFace[];
}

/** The shots of a clip, from its face scan (GET /api/clips/{id} → scenes; render props → scenes). */
export interface SceneData {
  /** Size of source.mp4 in px. */
  width: number;
  height: number;
  /** Every shot, covering the clip from 0 to its end. */
  shots: Shot[];
}

/** A planned scene: when the clip shows which view (duo and auto modes). */
export interface Scene {
  start: number;
  end: number;
  view: SceneView;
  /** [left, right] in a 'duo' scene. */
  faces: DuoFace[];
}

/** Most the source is blown up in a panel (output px per source px); covering the panel wins. */
export const DUO_MAX_UPSCALE = 2.2;
/** The face's center sits this far down its panel (headroom above, shoulders below). */
export const DUO_FACE_Y = 0.42;
/** Output px per design px (the render is 1080×1920). */
const OUT_PER_DESIGN = 1920 / H;
/** Shorter two-speaker shots are not split into panels (no layout flicker). */
export const MIN_DUO_S = 0.8;
/** Auto mode: a shorter scene takes a neighbour's view (full or framed) instead of switching for it. */
export const MIN_SCENE_S = 1.0;

/**
 * Shot times in faces.json are frame times rounded to 1 ms, so the first frame of a shot can sit up to
 * 0.5 ms before its rounded start. A frame counts from this much earlier: more than the rounding,
 * less than half a frame even at 120 fps.
 */
const SCENE_EPS = 0.004;

/** Modes that pick a view per scene from the clip's face scan. */
export const usesScenes = (mode: LayoutMode): boolean => mode === 'duo' || mode === 'auto';

/**
 * The view of every shot. 'duo' mode: two panels in two-speaker shots of at least MIN_DUO_S, full
 * elsewhere. 'auto' mode: the layout's `auto` choice for the shot's kind (a two-speaker shot too
 * short for panels counts as a group), then a scene shorter than MIN_SCENE_S takes the view of the
 * scene before it (or after it) when that is full or framed, so the layout does not flash for a
 * moment. Neighbouring full or framed scenes merge. Other modes: no scenes.
 */
export function scenePlan(data: SceneData | null | undefined, layout: Layout): Scene[] {
  if (!data || !Array.isArray(data.shots) || !usesScenes(layout.mode)) return [];
  const auto = layout.mode === 'auto';
  const out: Scene[] = data.shots.map((s) => {
    const panels = s.kind === 'duo' && s.faces?.length === 2 && s.end - s.start >= MIN_DUO_S;
    let view: SceneView;
    if (!auto) view = panels ? 'duo' : 'full';
    else {
      const kind: SceneKind = s.kind === 'duo' && !panels ? 'group' : s.kind;
      view = layout.auto[kind] || 'full';
    }
    return { start: s.start, end: s.end, view, faces: view === 'duo' ? s.faces.slice(0, 2) : [] };
  });
  if (auto) {
    for (let i = 0; i < out.length; i++) {
      const s = out[i];
      if (s.view === 'duo' || s.end - s.start >= MIN_SCENE_S) continue;
      const prev = out[i - 1];
      const next = out[i + 1];
      if (prev && prev.view !== 'duo') s.view = prev.view;
      else if (next && next.view !== 'duo') s.view = next.view;
    }
  }
  const merged: Scene[] = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && last.view === s.view && s.view !== 'duo') last.end = s.end;
    else merged.push({ ...s });
  }
  return merged;
}

/** The scene at source time `t`, or null (outside the plan: the clip shows full-frame). */
export function sceneAt(plan: Scene[], t: number): Scene | null {
  const u = t + SCENE_EPS;
  for (const s of plan) if (u >= s.start && u < s.end) return s;
  return null;
}

/** Seconds of the clip shown in each view. */
export function viewSeconds(plan: Scene[]): Record<SceneView, number> {
  const out: Record<SceneView, number> = { full: 0, duo: 0, framed: 0 };
  for (const s of plan) out[s.view] += Math.max(0, s.end - s.start);
  return out;
}

export interface DuoGeometry {
  /** The top and the bottom panel, full width. */
  top: Rect;
  bottom: Rect;
  seam: number;
  divider: Rect | null;
}

export function duoGeometry(layout: Layout): DuoGeometry {
  const d = layout.duo;
  const g = stackParts(d.split, true, d.divider);
  return { top: g.first, bottom: g.second, seam: g.seam, divider: g.divider };
}

/** The face for each panel: [top, bottom], from a duo scene's [left, right] and the layout's choice. */
export function duoFaces(layout: Layout, faces: DuoFace[]): [DuoFace, DuoFace] {
  const [left, right] = faces;
  return layout.duo.top === 'left' ? [left, right] : [right, left];
}

/**
 * Where the whole source picture goes, relative to its panel (design px), so that `face` is framed:
 * the face takes `faceSize` of the panel's height (no more than DUO_MAX_UPSCALE), centered across and
 * DUO_FACE_Y down, the picture always covering the panel (no bars; a face near the edge goes off-center).
 */
export function duoCrop(face: DuoFace, panel: { width: number; height: number }, source: { width: number; height: number }, faceSize: number): Rect {
  const aspect = source.width > 0 && source.height > 0 ? source.width / source.height : 16 / 9;
  let vh = (faceSize * panel.height) / Math.max(face.h, 0.01);
  if (source.height > 0) vh = Math.min(vh, (DUO_MAX_UPSCALE * source.height) / OUT_PER_DESIGN);
  vh = Math.max(vh, panel.height, panel.width / aspect);
  const vw = vh * aspect;
  return {
    left: clamp(panel.width / 2 - face.x * vw, panel.width - vw, 0),
    top: clamp(panel.height * DUO_FACE_Y - face.y * vh, panel.height - vh, 0),
    width: vw,
    height: vh,
  };
}

const SAMPLE_PAIR: DuoFace[] = [
  { x: 0.3, y: 0.42, h: 0.18 },
  { x: 0.7, y: 0.42, h: 0.18 },
];

/**
 * Stand-in scenes for previews without a clip (Brand Template, preset gallery). Duo mode: two people
 * all the time. Auto mode: two people, one person, then a picture without a face, `step` seconds
 * each, repeating (the preview's clock loops), so the preview shows every view.
 */
export function sampleScenes(mode: LayoutMode, step = 1.45): SceneData {
  if (mode !== 'auto') return { width: 1920, height: 1080, shots: [{ start: 0, end: 1e9, kind: 'duo', faces: SAMPLE_PAIR }] };
  const shots: Shot[] = [];
  const kinds: Array<[SceneKind, DuoFace[]]> = [
    ['duo', SAMPLE_PAIR],
    ['solo', [{ x: 0.5, y: 0.4, h: 0.35 }]],
    ['none', []],
  ];
  for (let i = 0; i < 60; i++) {
    const [kind, faces] = kinds[i % 3];
    shots.push({ start: i * step, end: (i + 1) * step, kind, faces });
  }
  return { width: 1920, height: 1080, shots };
}

/** The part of the layout dragged up and down on the Brand Template preview (podcast frame or card). */
export function stageRect(layout: Layout, aspect: number, title: string | null | undefined): Rect | null {
  if (layout.mode === 'podcast') return frameRect(layout, aspect);
  if (layout.mode === 'card') return cardGeometry(layout, aspect, title).card;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Dynamic zoom
// ---------------------------------------------------------------------------------------------

const ZOOM_IN = 0.2; // ramp up before a keyword starts, so the peak lands on it
const ZOOM_HOLD = 0.5; // stay zoomed this long after the keyword
const ZOOM_OUT = 0.45;
const ZOOM_MIN_WORD = 0.3;
const ZOOM_SWITCH = 0.12; // sentence style: quick change between the two framings
const SENTENCE_GAP = 0.7;
const SENTENCE_END = /[.?!…]["')\]]*$/;

/** Zoomed-in ranges [start, end] (seconds), from the clip's words. Filler words are ignored. */
export function zoomRanges(words: CaptionWord[] | null | undefined, style: ZoomStyle): Array<[number, number]> {
  const list = (words || [])
    .filter((w) => w && typeof w.word === 'string' && w.word.trim() && !isFiller(w.word))
    .map((w) => {
      const start = Math.max(0, Number(w.start) || 0);
      return { word: w.word.trim(), start, end: Math.max(start, Number(w.end) || 0), keyword: !!w.keyword };
    })
    .sort((a, b) => a.start - b.start);
  if (!list.length) return [];
  const out: Array<[number, number]> = [];
  if (style === 'keywords') {
    for (const w of list) {
      if (!w.keyword) continue;
      const range: [number, number] = [w.start, Math.max(w.end, w.start + ZOOM_MIN_WORD) + ZOOM_HOLD];
      const last = out[out.length - 1];
      // Close keywords share one zoom instead of pumping in and out
      if (last && range[0] - ZOOM_IN <= last[1] + ZOOM_OUT) last[1] = Math.max(last[1], range[1]);
      else out.push(range);
    }
    return out;
  }
  const starts = [list[0].start];
  for (let i = 1; i < list.length; i++) {
    if (SENTENCE_END.test(list[i - 1].word) || list[i].start - list[i - 1].end >= SENTENCE_GAP) starts.push(list[i].start);
  }
  for (let i = 1; i < starts.length; i += 2) out.push([starts[i], i + 1 < starts.length ? starts[i + 1] : Infinity]);
  return out;
}

/** Scale of the main video at time `t` (1 = no zoom). */
export function zoomAt(zoom: LayoutZoom, ranges: Array<[number, number]>, t: number): number {
  if (!zoom.enabled || !ranges.length) return 1;
  let env = 0;
  for (const [a, b] of ranges) {
    let e = 0;
    if (zoom.style === 'keywords') {
      if (t < a - ZOOM_IN || t > b + ZOOM_OUT) continue;
      e = t < a ? interpolate(t, [a - ZOOM_IN, a], [0, 1], Ease.easeOut) : t <= b ? 1 : interpolate(t, [b, b + ZOOM_OUT], [1, 0], Ease.easeInOut);
    } else {
      const h = ZOOM_SWITCH / 2;
      if (t < a - h || t > b + h) continue;
      e = t < a + h ? interpolate(t, [a - h, a + h], [0, 1], Ease.easeInOut) : t <= b - h ? 1 : interpolate(t, [b - h, b + h], [1, 0], Ease.easeInOut);
    }
    if (e > env) env = e;
    if (env >= 1) break;
  }
  return 1 + zoom.amount * env;
}

// ---------------------------------------------------------------------------------------------
// Speaker name tag
// ---------------------------------------------------------------------------------------------

/** Left edge of a left-aligned tag: clear of the widest left UI (TikTok, 120 px of 1080). */
export const SPEAKER_SIDE = Math.ceil(toDesign(PLATFORM_UI.tiktok).left);
export const SPEAKER_ROLE_SCALE = 0.75;
const SPEAKER_IN = 0.35;
const SPEAKER_ROLE_DELAY = 0.12;
const SPEAKER_OUT = 0.3;

export interface SpeakerFrame {
  /** 0..1 wipe of the name box and of the role box (left to right). */
  name: number;
  role: number;
  opacity: number;
}

/** The tag at time `t`, or null when it is hidden (off, no name, or outside its time). */
export function speakerAt(sp: LayoutSpeaker, t: number): SpeakerFrame | null {
  if (!sp.enabled || !sp.name.trim()) return null;
  const local = t - sp.start;
  if (local < 0 || local > sp.duration) return null;
  return {
    name: interpolate(local, [0, SPEAKER_IN], [0, 1], Ease.easeOut),
    role: interpolate(local, [SPEAKER_ROLE_DELAY, SPEAKER_ROLE_DELAY + SPEAKER_IN], [0, 1], Ease.easeOut),
    opacity: interpolate(local, [sp.duration - SPEAKER_OUT, sp.duration], [1, 0]),
  };
}

// ---------------------------------------------------------------------------------------------
// Presets (Brand Template gallery)
// ---------------------------------------------------------------------------------------------

export type LayoutPresetId =
  | 'full'
  | 'full-zoom'
  | 'podcast'
  | 'podcast-dark'
  | 'podcast-boxed'
  | 'blur-clean'
  | 'card-light'
  | 'card-dark'
  | 'split'
  | 'split-line'
  | 'duo'
  | 'duo-line'
  | 'auto';

/** A ready-made look in the Brand Template gallery. Its name and description are UI text, looked up by id there. */
export interface LayoutPreset {
  id: LayoutPresetId;
  patch: LayoutPatch;
}

const CARD_TEXT: Partial<LayoutHeader> = {
  enabled: true,
  fontFamily: 'Inter',
  fontWeight: 'Medium',
  fontSize: 26,
  align: 'left',
  isUppercase: false,
  maxLines: 4,
};

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: 'full', patch: { mode: 'full' } },
  {
    id: 'full-zoom',
    patch: { mode: 'full', zoom: { enabled: true, style: 'keywords', amount: 0.12 } },
  },
  { id: 'podcast', patch: { mode: 'podcast' } },
  {
    id: 'podcast-dark',
    patch: { mode: 'podcast', background: { type: 'color', color: '#000000', dim: 0 } },
  },
  {
    id: 'podcast-boxed',
    patch: {
      mode: 'podcast',
      frame: { margin: 12, radius: 16 },
      background: { type: 'gradient', color: '#0F2027', color2: '#2C5364', dim: 0 },
      header: { color: '#111111', boxColor: '#FFFFFFF2', fontSize: 28 },
    },
  },
  {
    id: 'blur-clean',
    patch: { mode: 'podcast', header: { enabled: false } },
  },
  {
    id: 'card-light',
    patch: { mode: 'card', frame: { y: 82, radius: 12 }, background: { type: 'blur', dim: 0.45 }, header: CARD_TEXT },
  },
  {
    id: 'card-dark',
    patch: {
      mode: 'card',
      frame: { y: 82, radius: 12 },
      background: { type: 'color', color: '#000000', dim: 0 },
      card: { color: '#16181C', textColor: '#E7E9EA', mutedColor: '#8B98A5' },
      header: CARD_TEXT,
    },
  },
  {
    id: 'split',
    patch: { mode: 'split' },
  },
  {
    id: 'split-line',
    patch: { mode: 'split', companion: { split: 0.56, divider: 3, dividerColor: '#FFFFFF' } },
  },
  {
    id: 'duo',
    patch: { mode: 'duo' },
  },
  {
    id: 'duo-line',
    patch: { mode: 'duo', duo: { divider: 3, dividerColor: '#FFFFFF' } },
  },
  {
    id: 'auto',
    patch: { mode: 'auto' },
  },
];

/**
 * The layout after picking a preset: the preset's look on top of the defaults. What the user typed
 * or uploaded stays: the custom title, the credit, the account (name, handle, avatar), the
 * background image, the speaker tag and the companion video.
 */
export function applyLayoutPreset(current: Layout, preset: LayoutPreset): Layout {
  const keep: LayoutPatch = {
    header: { source: current.header.source, text: current.header.text },
    credit: current.credit,
    card: { name: current.card.name, handle: current.card.handle, avatarUrl: current.card.avatarUrl },
    background: { imageUrl: current.background.imageUrl },
    speaker: current.speaker,
    companion: { videoUrl: current.companion.videoUrl, duration: current.companion.duration },
  };
  return resolveLayout(DEFAULT_LAYOUT, preset.patch, keep);
}

/** The preset the layout currently matches, if any. */
export function matchingPreset(layout: Layout): LayoutPreset | null {
  const key = JSON.stringify(resolveLayout(layout));
  return LAYOUT_PRESETS.find((p) => JSON.stringify(applyLayoutPreset(layout, p)) === key) || null;
}
