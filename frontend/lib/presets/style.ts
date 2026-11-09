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
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color || '').trim());
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
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

/**
 * Horizontal room (em, per side) a word needs when it is scaled up to `peak`: transforms do not
 * affect layout, so without it a growing word overlaps its neighbours. Reserved on every word all
 * the time, so the line never shifts while words animate. Width is estimated from the character count.
 */
export function growRoom(word: string, peak: number, c: Cfg): string {
  const perChar = c.isUppercase ? 0.68 : 0.56;
  const width = Array.from(word || '').length * perChar + em(c.letterSpacing, c) * Array.from(word || '').length;
  return `${Math.max(0, ((peak - 1) * width) / 2).toFixed(3)}em`;
}
