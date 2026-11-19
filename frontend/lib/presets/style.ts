import type React from 'react';
import { generateRoundedStroke, type CaptionWord, type PresetConfig } from './types';

type Cfg = Partial<PresetConfig>;

/** First family of a CSS font-family list, without quotes: "'Exo 2', sans-serif" -> "Exo 2". */
export function primaryFamily(value: string | undefined, fallback = 'Montserrat'): string {
  return ((value || '').split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '') || fallback;
}

const WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

/** UI weight names ('Regular', 'Semi-Bold', 'Extra-Bold', …) to CSS numeric weights. */
export function cssWeight(weight: string | number | undefined, fallback = 400): number {
  if (typeof weight === 'number') return weight;
  const key = (weight || '').toLowerCase().replace(/[\s_-]/g, '');
  return WEIGHTS[key] ?? fallback;
}

/** Design px (same scale as fontSize) to em of the caption font. */
export const em = (px: number | undefined, c: Cfg): number => (px || 0) / (c.fontSize || 36);

/** Font, weight, case, spacing: the text styling every preset shares. */
export function textBase(c: Cfg, opts: { fallbackFamily?: string; generic?: string; letterSpacing?: number } = {}): React.CSSProperties {
  const family = primaryFamily(c.fontFamily, opts.fallbackFamily || 'Montserrat');
  const generic = opts.generic || (/courier|mono/i.test(family) ? 'monospace' : 'sans-serif');
  return {
    fontFamily: `"${family}", ${generic}`,
    fontWeight: cssWeight(c.fontWeight),
    fontStyle: c.isItalic ? 'italic' : 'normal',
    textDecoration: c.isUnderline ? 'underline' : 'none',
    textTransform: c.isUppercase ? 'uppercase' : 'none',
    letterSpacing: `${em(c.letterSpacing ?? opts.letterSpacing ?? 0, c)}em`,
    lineHeight: c.lineHeight ?? 1.2,
    whiteSpace: 'pre',
  };
}

/** The user's drop shadow ("Bayangan") as one text-shadow layer, or null. */
export function dropShadow(c: Cfg): string | null {
  if (!c.hasShadow || !c.shadowColor) return null;
  return `${em(c.shadowX, c)}em ${em(c.shadowY, c)}em ${em(c.shadowBlur, c)}em ${c.shadowColor}`;
}

/** The user's rounded outline ("Garis luar") as text-shadow layers, or null. */
export function stroke(c: Cfg, fallbackWidth = 0): string | null {
  const width = c.strokeWidth ?? fallbackWidth;
  if (!width || width <= 0) return null;
  return generateRoundedStroke(width, c.strokeColor || '#000000', c.fontSize || 36);
}

/** Join text-shadow layers (first = on top). The outline goes above the drop shadow. */
export function shadows(...layers: Array<string | null | undefined | false>): string {
  const list = layers.filter((l): l is string => !!l && l !== 'none');
  return list.length ? list.join(', ') : 'none';
}

const INVISIBLE = new Set(['#000000', '#000', 'transparent', '#00000000', 'rgba(0,0,0,0)', '']);

/** The highlight color, unless it is unset/black/transparent (then the preset's own accent). */
export function highlight(c: Cfg, fallback: string): string {
  const h = (c.highlightColor || '').toLowerCase().replace(/\s/g, '');
  return INVISIBLE.has(h) ? fallback : (c.highlightColor as string);
}

const sameColor = (a?: string, b?: string) => (a || '').toLowerCase().replace(/\s/g, '') === (b || '').toLowerCase().replace(/\s/g, '');

/** Color for AI keywords: the highlight color, or a contrasting yellow when it equals the text color. */
export function keywordColor(c: Cfg, fontColor: string, fallbackHighlight: string): string {
  const h = highlight(c, fallbackHighlight);
  return sameColor(h, fontColor) ? (sameColor(h, '#FFD400') ? '#FF3D71' : '#FFD400') : h;
}

export const isKeyword = (w: CaptionWord | undefined): boolean => !!w && !!w.keyword;

/** Hex color (#rgb / #rrggbb) with an alpha, for glows. Other formats are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = rgbOf(color);
  return rgb ? `rgba(${rgb.join(', ')}, ${alpha})` : color;
}

/** #rgb / #rrggbb to [r, g, b] (0-255), or null for other formats. */
export function rgbOf(color: string | undefined): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color || '').trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map((ch) => ch + ch).join('') : m[1];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const lumOf = ([r, g, b]: [number, number, number]): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG relative luminance (0 black, 1 white) of a hex color, or null for other formats. */
export function luminance(color: string | undefined): number | null {
  const rgb = rgbOf(color);
  return rgb ? lumOf(rgb) : null;
}

/** WCAG contrast ratio of two relative luminances (1 to 21). */
export const contrastRatio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * `color` mixed toward white just enough to reach `min` contrast on a dark backdrop of luminance
 * `backdrop` (keeps its hue: a dark brand navy becomes a light navy). Other formats are returned unchanged.
 */
export function readableOnDark(color: string, backdrop: number, min = 3): string {
  const rgb = rgbOf(color);
  if (!rgb) return color;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mixed = rgb.map((v) => Math.round(v + (255 - v) * t)) as [number, number, number];
    if (contrastRatio(lumOf(mixed), backdrop) >= min || t > 0.999) {
      return t === 0 ? color : `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return color;
}

/** Shared row layout for multi-word presets: wraps, centered, gap in em. */
export const rowStyle = (gapEm = 0.28): React.CSSProperties => ({
  display: 'inline-flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'center',
  columnGap: `${gapEm}em`,
  rowGap: '0.1em',
  maxWidth: '100%',
});

/** Seconds since the word after `i` started (Infinity when there is none): drives a past word's "release". */
export const sinceNext = (words: CaptionWord[], i: number, time: number): number =>
  i + 1 < words.length ? time - words[i + 1].start : Infinity;
