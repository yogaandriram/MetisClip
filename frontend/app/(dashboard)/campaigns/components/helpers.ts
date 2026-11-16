// Small helpers shared by the campaign library and the campaign page.
import type { BadgeTone } from '@/components/ui'
import type { Brief, Campaign } from '@/lib/engine'
import { localeTag, tm } from '@/lib/i18n'

/** Same limits as the engine (backend/services/campaigns.py, brief_sources.py). */
export const MAX_SOURCES = 30
export const MAX_FILE_MB = 25
export const BRIEF_FILE_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'markdown', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']
export const BRIEF_FILE_ACCEPT = BRIEF_FILE_EXTENSIONS.map((e) => `.${e}`).join(',')

/** Quick-add suggestions for the platform list (product names, the same in every language). */
export const COMMON_PLATFORMS = ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Facebook Reels']

export function campaignHref(id: string): string {
  return `/campaigns/detail/?id=${encodeURIComponent(id)}`
}

/** An empty brief in the engine's shape (models/documents.py Brief). */
export function emptyBrief(): Brief {
  return {
    summary: '',
    platforms: [],
    deadline: null,
    allowed_sources: [],
    focus: [],
    must_include: [],
    banned_words: [],
    avoid: [],
    tone: '',
    audience: '',
    language: '',
    duration: { min: null, max: null },
    clips_target: 0,
    max_per_video: 0,
    visual: { subtitles: 'optional', logo: 'optional', credit: 'optional', notes: [] },
    post: { hashtags: [], mentions: [], cta: '', disclosure: '', caption_rules: [] },
    rules: [],
    payout: '',
    submission: '',
    questions: [],
  }
}

/** A brief from the engine with every field present (older documents may lack some). */
export function fullBrief(brief: Partial<Brief> | null | undefined): Brief {
  const base = emptyBrief()
  const b = brief || {}
  return {
    ...base,
    ...b,
    duration: { ...base.duration, ...(b.duration || {}) },
    visual: { ...base.visual, ...(b.visual || {}) },
    post: { ...base.post, ...(b.post || {}) },
    rules: b.rules || [],
  }
}

export function sameBrief(a: Brief, b: Brief): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** "#Brand X" -> "#BrandX" (as the engine stores hashtags and handles). */
export function asTag(prefix: '#' | '@') {
  return (item: string) => {
    const core = item.replace(/\s+/g, '').replace(/^[#@]+/, '')
    return core ? `${prefix}${core}` : ''
  }
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** The deadline as a badge: date, days left or overdue. Null without a valid deadline. */
export function deadlineBadge(deadline: string | null | undefined, today = new Date()): { label: string; tone: BadgeTone } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline || '')
  if (!m) return null
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (isNaN(due.getTime())) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((due.getTime() - start.getTime()) / 86_400_000)
  const t = tm().campaign.deadline
  const date = due.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' })
  if (days < 0) return { label: `${t.on(date)} · ${t.passed(-days)}`, tone: 'warning' }
  if (days === 0) return { label: t.today, tone: 'accent' }
  return { label: `${t.on(date)} · ${t.left(days)}`, tone: days <= 3 ? 'accent' : 'neutral' }
}

/** The reading state worth showing on a campaign card; null when idle. */
export function parseBadge(campaign: Pick<Campaign, 'parse' | 'draft' | 'has_draft'>): { label: string; tone: BadgeTone } | null {
  const t = tm().campaign.parseBadge
  switch (campaign.parse?.status) {
    case 'running':
      return { label: t.running, tone: 'ink' }
    case 'done':
      // Only while the reading still waits for review (saved or discarded drafts need no badge)
      return campaign.has_draft || campaign.draft ? { label: t.done, tone: 'accent' } : null
    case 'failed':
      return { label: t.failed, tone: 'error' }
    default:
      return null
  }
}

/** Local time stamp for a pasted screenshot's name, e.g. "16-11 14.05.12". */
export function screenshotStamp(d = new Date()): string {
  return d.toLocaleString(localeTag(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/[\\/:*?"<>|]/g, '.')
}
