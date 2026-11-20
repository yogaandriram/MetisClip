// Pure edits of a clip's subtitle words (the editor's word list). Times are seconds of the clip.
import type { SubtitleWord } from '@/lib/engine'

/** Shortest a word may last; shorter ones flash by or never show */
export const MIN_WORD_S = 0.05
/** Overlap or order slack, below what anyone sees */
const SLACK_S = 0.02

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** The word's text holds a space, so it can be split into one word per piece */
export const canSplit = (w: SubtitleWord) => /\S\s+\S/.test(w.word.trim())

/**
 * One word per space-separated piece of the word's text, timed by each piece's share of the letters.
 * Keyword marks stay on every piece; the emoji (shown from the word's start) stays on the first.
 */
export function splitWord(words: SubtitleWord[], index: number): SubtitleWord[] {
  const w = words[index]
  const parts = w ? w.word.trim().split(/\s+/).filter(Boolean) : []
  if (parts.length < 2) return words
  const letters = parts.reduce((n, p) => n + p.length, 0)
  const span = Math.max(0, w.end - w.start)
  let t = w.start
  const pieces = parts.map((text, i) => {
    const start = t
    const end = i === parts.length - 1 ? w.end : t + (span * text.length) / letters
    t = end
    const piece: SubtitleWord = { word: text, start: round3(start), end: round3(end) }
    if (w.confidence != null) piece.confidence = w.confidence
    if (w.keyword) piece.keyword = true
    if (i === 0 && w.emoji) piece.emoji = w.emoji
    return piece
  })
  return [...words.slice(0, index), ...pieces, ...words.slice(index + 1)]
}

/** The word and the next one as one word ("di" + "rumah" -> "di rumah"), from the first start to the last end. */
export function mergeWithNext(words: SubtitleWord[], index: number): SubtitleWord[] {
  const a = words[index]
  const b = words[index + 1]
  if (!a || !b) return words
  const merged: SubtitleWord = {
    word: `${a.word.trim()} ${b.word.trim()}`.trim(),
    start: Math.min(a.start, b.start),
    end: Math.max(a.end, b.end),
  }
  if (a.confidence != null && b.confidence != null) merged.confidence = Math.min(a.confidence, b.confidence)
  if (a.keyword || b.keyword) merged.keyword = true
  const emoji = a.emoji || b.emoji
  if (emoji) merged.emoji = emoji
  return [...words.slice(0, index), merged, ...words.slice(index + 2)]
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Indexes of the words whose text contains `find` (case ignored) */
export function findWords(words: SubtitleWord[], find: string): number[] {
  const needle = find.trim().toLocaleLowerCase()
  if (!needle) return []
  return words.flatMap((w, i) => (w.word.toLocaleLowerCase().includes(needle) ? [i] : []))
}

/**
 * Every `find` (case ignored) inside each word replaced by `replacement`. A word left empty is removed.
 * Returns the words and how many words changed.
 */
export function replaceInWords(words: SubtitleWord[], find: string, replacement: string): { words: SubtitleWord[]; changed: number } {
  const needle = find.trim()
  if (!needle) return { words, changed: 0 }
  const re = new RegExp(escapeRegExp(needle), 'gi')
  let changed = 0
  const out: SubtitleWord[] = []
  for (const w of words) {
    const text = w.word.replace(re, replacement)
    if (text === w.word) {
      out.push(w)
      continue
    }
    changed += 1
    if (text.trim()) out.push({ ...w, word: text })
  }
  return { words: out, changed }
}

export type WordProblem = 'empty' | 'short' | 'order' | 'overlap' | 'outside'

/** What is wrong with each word's text or times (null: nothing). `duration` is the clip's length (0: unknown). */
export function wordProblems(words: SubtitleWord[], duration: number): (WordProblem[] | null)[] {
  return words.map((w, i) => {
    const found: WordProblem[] = []
    const prev = words[i - 1]
    if (!w.word.trim()) found.push('empty')
    if (w.end - w.start < MIN_WORD_S - 0.001) found.push('short')
    if (prev && w.start < prev.start - SLACK_S) found.push('order')
    else if (prev && w.start < prev.end - SLACK_S) found.push('overlap')
    if (duration > 0 && w.start > duration + SLACK_S) found.push('outside')
    return found.length ? found : null
  })
}

/**
 * The words with their problems fixed, keeping their order and as much of their timing as possible:
 * empty words go, a word starts no earlier than the one before it ends, lasts at least MIN_WORD_S,
 * ends before the next one starts (when that one starts later), and stays inside the clip.
 */
export function fixWordTimes(words: SubtitleWord[], duration: number): SubtitleWord[] {
  const out = words.filter((w) => w.word.trim()).map((w) => ({ ...w }))
  for (let i = 0; i < out.length; i++) {
    const w = out[i]
    const prevEnd = i > 0 ? out[i - 1].end : 0
    let start = Math.max(0, w.start, prevEnd)
    if (duration > 0) start = Math.min(start, Math.max(0, duration - MIN_WORD_S))
    let end = Math.max(w.end, start + MIN_WORD_S)
    const next = out[i + 1]
    if (next && next.start >= start + MIN_WORD_S) end = Math.min(end, next.start)
    if (duration > 0) end = Math.min(end, duration)
    w.start = round3(start)
    w.end = round3(Math.max(end, start))
  }
  return out
}
