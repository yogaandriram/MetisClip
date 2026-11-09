// Caption timing logic shared by the editor, the Brand Template preview and the Remotion render:
// AI settings (filler words, silent pauses), word groups ("pages") and the cut list.
// Pure functions only (no React, no DOM), so the Remotion bundle and the UI compute the same thing.
import type { CaptionWord } from './types';

export interface AiCaptionSettings {
  /** Remove filler words (eh, hmm, …): hidden from the captions and cut from the video. */
  fillerWords: boolean;
  /** Cut silent pauses between sentences. */
  pauses: boolean;
  /** Highlight AI-picked keywords (word.keyword). */
  keywords: boolean;
  /** Show AI-picked emojis (word.emoji) above the caption. */
  emojis: boolean;
}

// Keep in sync with backend/services/render.py DEFAULT_AI_SETTINGS.
export const DEFAULT_AI_SETTINGS: AiCaptionSettings = {
  fillerWords: true,
  pauses: false,
  keywords: true,
  emojis: false,
};

export function resolveAi(raw?: Partial<AiCaptionSettings> | null): AiCaptionSettings {
  const out = { ...DEFAULT_AI_SETTINGS };
  if (raw) {
    for (const key of Object.keys(out) as (keyof AiCaptionSettings)[]) {
      if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filler words
// ---------------------------------------------------------------------------

// Single-token hesitations in Indonesian and English. Repeated letters are collapsed first
// ("hmmm" -> "hm", "eeeh" -> "eh"), so variants match too. Real words are never listed here.
const FILLERS = new Set(['e', 'eh', 'ehm', 'em', 'm', 'hm', 'um', 'uh', 'uhm', 'ah', 'erm', 'er', 'eu', 'ehe', 'ee']);

export function normalizeToken(word: string): string {
  return (word || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

export function isFiller(word: string): boolean {
  const t = normalizeToken(word);
  if (!t || t.length > 6) return false;
  return FILLERS.has(t) || FILLERS.has(t.replace(/(.)\1+/g, '$1'));
}

/** Words as they appear on screen: sorted, sane timings, fillers and disabled AI marks removed. */
export function displayWords(words: CaptionWord[], ai: AiCaptionSettings): CaptionWord[] {
  const out: CaptionWord[] = [];
  for (const w of words || []) {
    if (!w || typeof w.word !== 'string' || !w.word.trim()) continue;
    if (ai.fillerWords && isFiller(w.word)) continue;
    const start = Math.max(0, Number(w.start) || 0);
    const end = Math.max(start + 0.05, Number(w.end) || 0);
    out.push({
      word: w.word.trim(),
      start,
      end,
      keyword: ai.keywords ? !!w.keyword : false,
      emoji: ai.emojis && w.emoji ? w.emoji : null,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Pages: the group of words that is on screen together
// ---------------------------------------------------------------------------

export interface CaptionPage {
  words: CaptionWord[];
  start: number;
  /** When the page leaves the screen (next page start, or a short hold after the last word). */
  end: number;
  /** True when the page ends in silence (fades out) instead of being replaced by the next one. */
  fadeOut: boolean;
}

const PAGE_BREAK_GAP = 0.6; // a longer silence always starts a new page
const PAGE_HOLD = 0.5; // keep the last page this long after its last word
const PAGE_FADE = 0.15; // fade-out duration at the end of a page that ends in silence

/**
 * Group words into pages of at most `perPage` words and about `maxChars` characters (one line at the
 * chosen font size). Breaks at sentence ends, commas (after 2+ words) and longer silences.
 */
export function buildPages(words: CaptionWord[], perPage: number, maxChars = 18): CaptionPage[] {
  const max = Math.max(1, Math.floor(perPage || 1));
  const groups: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  let chars = 0;
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const len = w.word.length;
    const breakBefore =
      cur.length > 0 &&
      (cur.length >= max ||
        w.start - prev.end > PAGE_BREAK_GAP ||
        /[.?!…]["')\]]*$/.test(prev.word) ||
        (cur.length >= 2 && /[,;:]["')\]]*$/.test(prev.word)) ||
        (max > 1 && chars + 1 + len > maxChars));
    if (breakBefore) {
      groups.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(w);
    chars += (cur.length > 1 ? 1 : 0) + len;
  }
  if (cur.length) groups.push(cur);

  return groups.map((g, i) => {
    const start = g[0].start;
    const lastEnd = Math.max(...g.map((w) => w.end));
    const next = groups[i + 1];
    if (next && next[0].start - lastEnd <= PAGE_HOLD + 0.1) {
      return { words: g, start, end: Math.max(next[0].start, start + 0.05), fadeOut: false };
    }
    return { words: g, start, end: lastEnd + PAGE_HOLD, fadeOut: true };
  });
}

export interface CaptionFrame {
  page: CaptionPage;
  pageIndex: number;
  /** Index (in page.words) of the last word that has started. */
  activeIndex: number;
  /** 0 = fully visible, 1 = gone (fade at the end of a page that ends in silence). */
  exit: number;
}

export function captionAt(pages: CaptionPage[], t: number): CaptionFrame | null {
  // Pages are sorted and do not overlap; binary search for the last page starting at or before t.
  let lo = 0;
  let hi = pages.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pages[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const page = pages[found];
  if (t >= page.end) return null;
  let activeIndex = 0;
  for (let i = 0; i < page.words.length; i++) if (page.words[i].start <= t) activeIndex = i;
  const exit = page.fadeOut ? Math.min(1, Math.max(0, (t - (page.end - PAGE_FADE)) / PAGE_FADE)) : 0;
  return { page, pageIndex: found, activeIndex, exit };
}

// ---------------------------------------------------------------------------
// Cuts: filler words and silent pauses removed from the exported video
// ---------------------------------------------------------------------------

export interface Segment {
  /** Source seconds (raw.mp4) that are kept. */
  start: number;
  end: number;
}

const PAUSE_MIN = 0.6; // silences longer than this are shortened
const PAUSE_PAD = 0.15; // silence kept on each side of a cut (natural breathing room)
const FILLER_MIN = 0.08;
const MIN_KEEP = 0.12;

/**
 * Kept ranges of the source video. `offsetSec` is the caption sync offset: a word is heard at
 * `word.start + offsetSec`. Returns one full segment when nothing is cut.
 */
export function computeKeepSegments(
  words: CaptionWord[],
  duration: number,
  ai: Pick<AiCaptionSettings, 'fillerWords' | 'pauses'>,
  offsetSec = 0,
): Segment[] {
  const full: Segment[] = [{ start: 0, end: Math.max(0, duration || 0) }];
  if (!(duration > 0) || (!ai.fillerWords && !ai.pauses)) return full;

  const heard = (words || [])
    .filter((w) => w && typeof w.word === 'string' && w.word.trim())
    .map((w) => {
      const start = Math.max(0, (Number(w.start) || 0) + offsetSec);
      return { word: w.word, start, end: Math.max(start, (Number(w.end) || 0) + offsetSec) };
    })
    .sort((a, b) => a.start - b.start);
  if (!heard.length) return full;

  const cuts: Segment[] = [];
  if (ai.fillerWords) {
    for (const w of heard) if (isFiller(w.word) && w.end - w.start >= FILLER_MIN) cuts.push({ start: w.start, end: w.end });
  }
  if (ai.pauses) {
    const speech = ai.fillerWords ? heard.filter((w) => !isFiller(w.word)) : heard;
    if (speech.length) {
      if (speech[0].start > PAUSE_MIN) cuts.push({ start: 0, end: speech[0].start - PAUSE_PAD });
      for (let i = 0; i < speech.length - 1; i++) {
        const a = speech[i].end;
        const b = speech[i + 1].start;
        if (b - a > PAUSE_MIN) cuts.push({ start: a + PAUSE_PAD, end: b - PAUSE_PAD });
      }
      const lastEnd = speech[speech.length - 1].end;
      if (duration - lastEnd > PAUSE_MIN + PAUSE_PAD) cuts.push({ start: lastEnd + 2 * PAUSE_PAD, end: duration });
    }
  }
  if (!cuts.length) return full;

  cuts.sort((a, b) => a.start - b.start);
  const keep: Segment[] = [];
  let pos = 0;
  for (const c of cuts) {
    const s = Math.max(0, Math.min(duration, c.start));
    const e = Math.max(0, Math.min(duration, c.end));
    if (e <= pos) continue;
    if (s > pos) keep.push({ start: pos, end: s });
    pos = Math.max(pos, e);
  }
  if (pos < duration) keep.push({ start: pos, end: duration });
  const kept = keep.filter((k) => k.end - k.start >= MIN_KEEP);
  return kept.length ? kept : full;
}

export const isCut = (segments: Segment[], duration: number): boolean =>
  segments.length > 1 || (segments.length === 1 && (segments[0].start > 0.001 || segments[0].end < duration - 0.001));

export const keptDuration = (segments: Segment[]): number => segments.reduce((sum, s) => sum + (s.end - s.start), 0);

/**
 * Where playback should continue when it reaches source time `t`: `t` itself when it is inside a
 * kept range, else the start of the next kept range, or null after the last one.
 */
export function nextKeptTime(segments: Segment[], t: number): number | null {
  for (const s of segments) {
    if (t < s.start) return s.start;
    if (t < s.end - 0.02) return t;
  }
  return null;
}

export interface FrameSegment {
  /** Output frame where this segment starts. */
  from: number;
  /** Source frames [startFrame, endFrame). */
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
}

export function frameSegments(segments: Segment[], fps: number): FrameSegment[] {
  const out: FrameSegment[] = [];
  let from = 0;
  for (const s of segments) {
    const startFrame = Math.round(s.start * fps);
    const endFrame = Math.round(s.end * fps);
    const durationInFrames = endFrame - startFrame;
    if (durationInFrames <= 0) continue;
    out.push({ from, startFrame, endFrame, durationInFrames });
    from += durationInFrames;
  }
  return out;
}

/** Source time (seconds) shown at output frame `frame`. */
export function sourceTimeAt(segments: FrameSegment[], frame: number, fps: number): number {
  for (const s of segments) {
    if (frame < s.from + s.durationInFrames) return (s.startFrame + Math.max(0, frame - s.from)) / fps;
  }
  const last = segments[segments.length - 1];
  return last ? (last.endFrame + (frame - last.from - last.durationInFrames)) / fps : frame / fps;
}
