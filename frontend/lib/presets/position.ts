// Where the caption sits on the 9:16 video, and the areas each platform covers with its own UI.
// Pure (no React, no DOM): used by CaptionLayer (editor, Brand Template, Remotion render), the line
// metrics and the position controls, so all of them agree on the caption box.
//
// Units are design px of DESIGN_CANVAS (the Brand Template preview size). `positionY` is the
// distance of the caption's bottom edge from the bottom of the video, `positionX` the horizontal
// center of the caption.

/** Canvas the design px refer to (the Brand Template preview size). */
export const DESIGN_CANVAS = { width: 300, height: 533 };

const VIDEO = { width: 1080, height: 1920 };

export type Platform = 'tiktok' | 'reels' | 'shorts';

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Areas covered by each app's own UI (tabs, title and description, the buttons on the right), in px
 * of a 1080×1920 video. These are the platforms' ad safe zones, the strictest published figures
 * (organic posts cover a little less): TikTok's ad spec; Meta for Reels: 14 % top, 35 % bottom,
 * 6 % on the sides; Google for YouTube Shorts.
 */
export const PLATFORM_UI: Record<Platform, Insets> = {
  tiktok: { top: 240, bottom: 660, left: 120, right: 120 },
  reels: { top: 269, bottom: 672, left: 65, right: 65 },
  shorts: { top: 288, bottom: 672, left: 48, right: 192 },
};

export const PLATFORMS = Object.keys(PLATFORM_UI) as Platform[];

export const PLATFORM_LABELS: Record<Platform, string> = { tiktok: 'TikTok', reels: 'IG Reels', shorts: 'YT Shorts' };

/** Covered by at least one platform; a caption outside it is visible everywhere. */
export const ALL_PLATFORMS_UI: Insets = {
  top: Math.max(...PLATFORMS.map((p) => PLATFORM_UI[p].top)),
  bottom: Math.max(...PLATFORMS.map((p) => PLATFORM_UI[p].bottom)),
  left: Math.max(...PLATFORMS.map((p) => PLATFORM_UI[p].left)),
  right: Math.max(...PLATFORMS.map((p) => PLATFORM_UI[p].right)),
};

/** Video px → design px. */
export function toDesign(i: Insets): Insets {
  const sx = DESIGN_CANVAS.width / VIDEO.width;
  const sy = DESIGN_CANVAS.height / VIDEO.height;
  return { top: i.top * sy, bottom: i.bottom * sy, left: i.left * sx, right: i.right * sx };
}

const W = DESIGN_CANVAS.width;
const H = DESIGN_CANVAS.height;
const SAFE = toDesign(ALL_PLATFORMS_UI);
/** Room kept between the caption and the platform UI. */
const GAP = 3;

/** Width of a centered caption box, as a share of the video: clear of every platform's buttons. */
export const CAPTION_WIDTH = 0.62;
export const CENTER_X = W / 2;
/** Default caption bottom edge: just above the area every platform covers at the bottom. */
export const DEFAULT_POSITION_Y = Math.ceil(SAFE.bottom) + GAP;
const MIN_CENTER = 40;
const MIN_WIDTH = 80;

interface PosCfg {
  positionX?: number;
  positionY?: number;
  fontSize?: number;
  lineHeight?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function captionCenterX(c: PosCfg): number {
  const x = Number(c.positionX);
  return clamp(Number.isFinite(x) ? x : CENTER_X, MIN_CENTER, W - MIN_CENTER);
}

/** Caption box width (design px): CAPTION_WIDTH of the video, narrower near a side so it stays on the video. */
export function captionWidth(c: PosCfg): number {
  const cx = captionCenterX(c);
  return Math.max(MIN_WIDTH, Math.min(CAPTION_WIDTH * W, 2 * Math.min(cx, W - cx)));
}

/**
 * Estimated height (design px) of one caption page: pages hold one line, plus the padding of boxed
 * presets and, with AI emojis on, the emoji above the words. Font size in design px = fontSize / 2.
 */
export function captionHeight(c: PosCfg, emoji: boolean): number {
  const font = (c.fontSize || 36) / 2;
  return font * ((c.lineHeight || 1.2) + 0.6) + (emoji ? font * 1.6 : 0);
}

/** Caption box in design px; `bottom` and `top` are measured from the bottom of the video. */
export function captionRect(c: PosCfg, emoji: boolean) {
  const cx = captionCenterX(c);
  const w = captionWidth(c);
  const bottom = Number(c.positionY) || 0;
  return { left: cx - w / 2, right: cx + w / 2, bottom, top: bottom + captionHeight(c, emoji) };
}

/** Platforms whose own UI may cover part of the caption. */
export function coveredBy(c: PosCfg, emoji: boolean): Platform[] {
  const r = captionRect(c, emoji);
  const eps = 0.5;
  return PLATFORMS.filter((p) => {
    const z = toDesign(PLATFORM_UI[p]);
    return r.left < z.left - eps || r.right > W - z.right + eps || r.bottom < z.bottom - eps || r.top > H - z.top + eps;
  });
}

export type QuickPosition = 'top' | 'middle' | 'bottom';

/** Centered caption at the top, middle or bottom of the area that is safe on every platform. */
export function quickPosition(which: QuickPosition, c: PosCfg, emoji: boolean): { positionX: number; positionY: number } {
  const h = captionHeight(c, emoji);
  const lowest = DEFAULT_POSITION_Y;
  const highest = Math.max(lowest, Math.floor(H - SAFE.top - GAP - h));
  const y = which === 'bottom' ? lowest : which === 'top' ? highest : clamp(Math.round((H - h) / 2), lowest, highest);
  return { positionX: CENTER_X, positionY: y };
}

/** The nearest position inside the area that is safe on every platform. */
export function moveIntoSafeArea(c: PosCfg, emoji: boolean): { positionX: number; positionY: number } {
  let cx = captionCenterX(c);
  // The box narrows near a side, so settle the center twice (the width depends on it)
  for (let i = 0; i < 2; i++) {
    const half = captionWidth({ ...c, positionX: cx }) / 2;
    const lo = Math.ceil(SAFE.left + half);
    const hi = Math.floor(W - SAFE.right - half);
    cx = lo <= hi ? clamp(Math.round(cx), lo, hi) : CENTER_X;
  }
  const h = captionHeight(c, emoji);
  const highest = Math.max(DEFAULT_POSITION_Y, Math.floor(H - SAFE.top - GAP - h));
  const y = clamp(Math.round(Number(c.positionY) || 0), DEFAULT_POSITION_Y, highest);
  return { positionX: cx, positionY: y };
}

/** Limits for the position controls and dragging (design px). */
export const POSITION_LIMITS = { x: { min: MIN_CENTER, max: W - MIN_CENTER }, y: { min: 0, max: H - 40 } };

// ---------------------------------------------------------------------------------------------
// Output formats: the 9:16 video, or a 1:1 or 16:9 one for feeds and YouTube
// ---------------------------------------------------------------------------------------------

/** 'vertical' 9:16 (every layout), 'square' 1:1 and 'landscape' 16:9 (the source video cropped per shot). */
export type OutputFormat = 'vertical' | 'square' | 'landscape';
export const OUTPUT_FORMATS: OutputFormat[] = ['vertical', 'square', 'landscape'];

/** Output size of each format in px (the "Hemat" quality renders at 2/3 of it). */
export const FORMAT_SIZE: Record<OutputFormat, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

/** CSS aspect-ratio of a format's preview box. */
export const FORMAT_ASPECT: Record<OutputFormat, string> = { vertical: '9 / 16', square: '1 / 1', landscape: '16 / 9' };

/**
 * A format's canvas in design px, at the same px per design px as the 9:16 video (1080 / 300): text,
 * the logo and the speaker tag keep their size in px in every format. 9:16 is DESIGN_CANVAS itself.
 */
export function formatCanvas(format: OutputFormat): { width: number; height: number } {
  if (format === 'vertical') return DESIGN_CANVAS;
  const k = W / VIDEO.width;
  return { width: Math.round(FORMAT_SIZE[format].width * k), height: Math.round(FORMAT_SIZE[format].height * k) };
}

/** Room kept at the top and the bottom of a 1:1 or 16:9 video (share of its height). */
export const FORMAT_MARGIN = 0.07;

/**
 * Where a height above the bottom of the 9:16 video (design px) lands in another format. The band every
 * platform leaves free on 9:16 (from the default caption position up to the top UI line) maps onto the
 * format's height less FORMAT_MARGIN at both ends, so the default caption sits low, a caption placed at
 * the top stays at the top, and the space between the caption and the speaker tag is kept. 9:16: as is.
 */
export function formatFromBottom(d: number, format: OutputFormat): number {
  if (format === 'vertical') return d;
  const fh = formatCanvas(format).height;
  const lo = DEFAULT_POSITION_Y;
  const hi = H - SAFE.top;
  const lo2 = FORMAT_MARGIN * fh;
  const hi2 = fh - FORMAT_MARGIN * fh;
  if (d <= lo) return (Math.max(0, d) / lo) * lo2;
  if (d >= hi) return hi2 + ((Math.min(H, d) - hi) / (H - hi)) * (fh - hi2);
  return lo2 + ((d - lo) / (hi - lo)) * (hi2 - lo2);
}

/**
 * The caption's `positionY` inside a format's overlay box (FormatBox: 300 design px wide, as tall as the
 * 9:16 video, standing on the format's bottom edge): its bottom edge mapped by formatFromBottom and kept
 * under the format's top margin.
 */
export function formatCaptionY(c: PosCfg, emoji: boolean, format: OutputFormat): number {
  const y = Number(c.positionY) || 0;
  if (format === 'vertical') return y;
  const fh = formatCanvas(format).height;
  const top = fh - FORMAT_MARGIN * fh - captionHeight(c, emoji);
  return Math.round(Math.max(0, Math.min(top, formatFromBottom(y, format))) * 100) / 100;
}

/** The top of a speaker tag (design px from the top of the 9:16 video) inside a format's overlay box. */
export function formatTagTop(y: number, format: OutputFormat): number {
  if (format === 'vertical') return y;
  const fh = formatCanvas(format).height;
  const fromBottom = Math.min(fh - FORMAT_MARGIN * fh, formatFromBottom(H - y, format));
  return Math.round((H - fromBottom) * 100) / 100;
}

/**
 * The logo's top-left in a format's canvas (design px): it keeps its distance to the nearest side and
 * to the nearest of the top and the bottom edge, so a corner logo stays in its corner. `width` is the
 * logo's width; its height is the same in every format, so keeping its top edge's distance to the
 * bottom keeps its bottom edge's too.
 */
export function formatLogoPosition(pos: { x: number; y: number }, width: number, format: OutputFormat): { x: number; y: number } {
  if (format === 'vertical') return pos;
  const f = formatCanvas(format);
  const x = pos.x + width / 2 <= W / 2 ? pos.x : f.width - (W - pos.x);
  const y = pos.y + width / 2 <= H / 2 ? pos.y : f.height - (H - pos.y);
  return { x: Math.max(0, Math.min(f.width - width, x)), y: Math.max(0, y) };
}
