// Campaign briefs on the job form, the gallery and the clip editor (engine: models/documents.py Brief,
// services/brief_check.py). Pure helpers; the wording lives in lib/i18n/messages/*/brief.ts.
import type { Brief, BriefCheckSummary } from '@/lib/engine'

/** A job can follow at most this many campaigns (api/routes/jobs.py MAX_CAMPAIGNS_PER_JOB). */
export const MAX_CAMPAIGNS_PER_JOB = 5

/** Custom clip durations the engine accepts (models/documents.py CUSTOM_DURATION_*). */
export const CUSTOM_DURATION = { min: 10, max: 180, span: 5 }

export const campaignHref = (id: string) => `/campaigns/detail/?id=${encodeURIComponent(id)}`

/** The client worth showing next to a campaign's name: empty when it only repeats the name. */
export function shownClient(c: { name: string; client?: string | null }): string {
  const client = (c.client || '').trim()
  const same = (s: string) => s.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
  return client && same(client) !== same(c.name || '') ? client : ''
}
export const campaignClipsHref = (id: string) => `/clips/?campaign=${encodeURIComponent(id)}`

/** "45-60" -> [45, 60]; null when it is not a range. */
export function parseDuration(value: string): [number, number] | null {
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(value.trim())
  if (!m) return null
  const lo = Number(m[1])
  const hi = Number(m[2])
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null
}

export function validCustomDuration(lo: number, hi: number): boolean {
  return Number.isFinite(lo) && Number.isFinite(hi) && lo >= CUSTOM_DURATION.min && hi <= CUSTOM_DURATION.max && hi - lo >= CUSTOM_DURATION.span
}

export interface DurationBounds {
  /** The longest minimum and the shortest maximum of the chosen briefs (null = none sets one) */
  min: number | null
  max: number | null
  /** One brief's minimum is above another's maximum */
  conflict: boolean
}

/** What the chosen briefs together allow; null when none of them names a duration. */
export function briefDurationBounds(briefs: Brief[]): DurationBounds | null {
  let min: number | null = null
  let max: number | null = null
  for (const b of briefs) {
    const d = b?.duration || { min: null, max: null }
    if (d.min) min = min === null ? d.min : Math.max(min, d.min)
    if (d.max) max = max === null ? d.max : Math.min(max, d.max)
  }
  if (min === null && max === null) return null
  return { min, max, conflict: min !== null && max !== null && min > max }
}

/**
 * The chosen range sits inside the bounds. The job's range may let a clip end a few seconds late; the
 * engine still keeps each campaign's clips inside its own brief (analyzer.fit_brief_length).
 */
export function durationFits(bounds: DurationBounds, [lo, hi]: [number, number]): boolean {
  return (bounds.min === null || lo >= bounds.min) && (bounds.max === null || hi <= bounds.max)
}

/**
 * A custom range inside the bounds that stays close to the current choice (same width where it fits),
 * or null when the current choice already fits or the briefs conflict.
 */
export function suggestDuration(bounds: DurationBounds, current: [number, number]): [number, number] | null {
  if (bounds.conflict || durationFits(bounds, current)) return null
  const { min: LIM_MIN, max: LIM_MAX, span } = CUSTOM_DURATION
  let lo = Math.max(LIM_MIN, bounds.min ?? LIM_MIN)
  let hi = Math.min(LIM_MAX, bounds.max ?? LIM_MAX)
  if (hi - lo < span) {
    // Narrower than a custom range may be (e.g. "tepat 60 detik"): at least `span` wide around it
    if (hi - lo < span) lo = Math.max(LIM_MIN, hi - span)
    if (hi - lo < span) hi = Math.min(LIM_MAX, lo + span)
  }
  const width = Math.max(span, Math.min(current[1] - current[0], hi - lo))
  let from = Math.ceil(Math.min(Math.max(current[0], lo), hi - width))
  let to = Math.floor(from + width)
  if (to - from < span) to = from + span
  if (to > LIM_MAX) {
    to = LIM_MAX
    from = to - Math.max(span, width)
  }
  return [Math.max(LIM_MIN, from), to]
}

/** The brief says nothing the AI could follow yet (the campaign was just created). */
export function isBriefEmpty(brief: Brief | null | undefined): boolean {
  if (!brief) return true
  const none = (items: unknown[] | undefined) => !items || items.length === 0
  return (
    !(brief.summary || '').trim() &&
    none(brief.focus) &&
    none(brief.must_include) &&
    none(brief.banned_words) &&
    none(brief.avoid) &&
    none(brief.rules) &&
    !brief.duration?.min &&
    !brief.duration?.max
  )
}

/** Days from today (local date) to a YYYY-MM-DD deadline; negative once it has passed. */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const due = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((due - today) / 86_400_000)
}

export type BriefState = 'ready' | 'fail' | 'manual'

/** Where a campaign clip stands against its brief, for the gallery badge. */
export function briefState(summary: BriefCheckSummary): BriefState {
  if (summary.fail > 0) return 'fail'
  if (summary.manual_open > 0) return 'manual'
  return 'ready'
}

/** A brief's YYYY-MM-DD as a local date ("20 Nov 2026"), without a timezone shift. */
export function formatBriefDate(date: string | null | undefined, locale: string): string {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null
  if (!m) return date || '-'
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}
