// Text width estimates for caption layout: how many characters fit on one line, how much room a
// scaled word needs, and when a long word has to shrink to stay inside the video.
// Pure functions (no DOM), so the editor, the Brand Template preview and the Remotion render agree.
import type { PresetConfig } from './types';
import { cssWeight, em, primaryFamily } from './style';

type Cfg = Partial<PresetConfig>;

/**
 * Average glyph advance in em for Indonesian caption text: [uppercase, lowercase] at weight 400 and
 * at weight 900. Measured from the bundled woff files (Courier New: the Windows system font).
 */
const FONT_WIDTH: Record<string, [number, number, number, number]> = {
  Montserrat: [0.684, 0.554, 0.72, 0.602],
  Inter: [0.649, 0.51, 0.687, 0.558],
  Poppins: [0.603, 0.556, 0.674, 0.602],
  Orbitron: [0.766, 0.602, 0.767, 0.608],
  Outfit: [0.63, 0.489, 0.677, 0.531],
  Roboto: [0.609, 0.482, 0.624, 0.493],
  Oswald: [0.47, 0.388, 0.555, 0.478],
  'Plus Jakarta Sans': [0.628, 0.517, 0.662, 0.542],
  Fredoka: [0.624, 0.492, 0.607, 0.5],
  'Exo 2': [0.586, 0.499, 0.637, 0.548],
  'Bebas Neue': [0.377, 0.377, 0.377, 0.377],
  Anton: [0.452, 0.443, 0.452, 0.443],
  Bangers: [0.402, 0.402, 0.402, 0.402],
  'Permanent Marker': [0.662, 0.538, 0.662, 0.538],
  Righteous: [0.613, 0.513, 0.613, 0.513],
  'Russo One': [0.67, 0.557, 0.67, 0.557],
  'Lilita One': [0.587, 0.474, 0.587, 0.474],
  'Courier New': [0.6, 0.6, 0.6, 0.6],
};

/** Caption box width in em of the caption font: 80% of the video width, font = fontSize/6 cqw. */
export const lineWidthEm = (c: Cfg): number => 480 / Math.max(6, c.fontSize || 36);

/** Average advance of one character in em, including letter spacing. */
export function charWidthEm(c: Cfg): number {
  const m = FONT_WIDTH[primaryFamily(c.fontFamily)] || FONT_WIDTH.Montserrat;
  const t = Math.min(1, Math.max(0, (cssWeight(c.fontWeight) - 400) / 500));
  const upper = m[0] + (m[2] - m[0]) * t;
  const lower = m[1] + (m[3] - m[1]) * t;
  return (c.isUppercase ? upper : lower) + em(c.letterSpacing, c);
}

export const textWidthEm = (text: string, c: Cfg): number => Array.from(text || '').length * charWidthEm(c);

/** Characters that fit on one caption line at this style (used to group words into pages). */
export function lineChars(c: Cfg): number {
  // 0.82: room for word gaps, per-word padding and the growth of the active word
  return Math.max(6, Math.min(40, Math.floor((lineWidthEm(c) * 0.82) / charWidthEm(c))));
}

/**
 * Horizontal room (em, per side) a word needs when it is scaled up to `peak`: transforms do not
 * affect layout, so without it a growing word overlaps its neighbours. Reserved on every word all
 * the time, so the line never shifts while words animate.
 */
export function growRoom(word: string, peak: number, c: Cfg): string {
  return `${Math.max(0, ((peak - 1) * textWidthEm(word, c)) / 2).toFixed(3)}em`;
}

/**
 * Font scale (≤ 1) that keeps the longest word of a page inside the caption box. A single word
 * cannot wrap, so a long word at a large preset size would otherwise run off the video.
 */
export function fitScale(words: { word: string }[], c: Cfg): number {
  let widest = 0;
  for (const w of words) widest = Math.max(widest, textWidthEm(w.word, c));
  // 1.25: the active word's pop/scale plus wide letters (M, W, G) above the average advance;
  // 1.8em: padding, boxes and pills around a word
  const need = widest * 1.25 + 1.8;
  const avail = lineWidthEm(c);
  return need > avail ? Math.max(0.4, avail / need) : 1;
}
