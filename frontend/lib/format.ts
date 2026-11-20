// Small formatting helpers shared by the desktop UI. Text and number/date formats follow the current
// UI language (lib/i18n): labels are getters, so they are read at render time.
import { localeTag, tm } from './i18n'
import { EngineError, type ClipStatus, type Job, type JobStatus, type JobStep, type RenderStatus } from './engine'

import type { BadgeTone } from '@/components/ui/Badge'

export function errorMessage(err: unknown, fallback?: string): string {
  fallback = fallback ?? tm().common.unexpectedError
  if (err instanceof EngineError) return err.message
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return fallback
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toLocaleString(localeTag(), { maximumFractionDigits: value >= 100 ? 0 : 1 })} ${units[i]}`
}

/** 75.4 -> "1:15" */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString(localeTag(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatCompactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(localeTag(), { maximumFractionDigits: 1 })} ${tm().status.millionSuffix}`
  if (n >= 1_000) return `${(n / 1_000).toLocaleString(localeTag(), { maximumFractionDigits: 1 })} ${tm().status.thousandSuffix}`
  return n.toLocaleString(localeTag())
}

const JOB_STEP_IDS: JobStep[] = ['discovery', 'analysis', 'processing']

export const JOB_STEPS: { id: JobStep; label: string }[] = JOB_STEP_IDS.map((id) => ({
  id,
  get label() {
    return tm().status.steps[id]
  },
}))

export function jobStepLabel(step: JobStep | null | undefined): string {
  return JOB_STEPS.find((s) => s.id === step)?.label || tm().status.steps.waiting
}

const JOB_TONES: Record<JobStatus, BadgeTone> = {
  pending: 'neutral',
  running: 'ink',
  interrupted: 'warning',
  cancelled: 'quiet',
  completed: 'success',
  failed: 'error',
}

/** Label (current language) and badge tone per job status. */
export const JOB_STATUS = labelled(JOB_TONES, (s) => tm().status.job[s])

export const ACTIVE_JOB_STATUSES: JobStatus[] = ['pending', 'running']
export const RESUMABLE_JOB_STATUSES: JobStatus[] = ['interrupted', 'failed', 'cancelled']

const CLIP_TONES: Record<ClipStatus, BadgeTone> = {
  processing: 'ink',
  ready: 'accent',
  rendering: 'ink',
  exported: 'success',
  failed: 'error',
}

export const CLIP_STATUS = labelled(CLIP_TONES, (s) => tm().status.clip[s])

const RENDER_STATUSES: RenderStatus[] = ['queued', 'rendering', 'completed', 'failed', 'cancelled']

/** Render progress line per render status (current language). */
export const RENDER_STATUS = Object.defineProperties(
  {} as Record<RenderStatus, string>,
  Object.fromEntries(RENDER_STATUSES.map((s) => [s, { enumerable: true, get: () => tm().status.render[s] }]))
)

const CLIP_DURATIONS = ['30-45', '45-60', '60-75', '75-90'] as const

export const CLIP_DURATION_OPTIONS: { value: (typeof CLIP_DURATIONS)[number]; label: string }[] = CLIP_DURATIONS.map((value) => ({
  value,
  get label() {
    return tm().status.durations[value]
  },
}))

/** Video containers Cari Video accepts for upload (backend/agents/nodes/discovery.py VIDEO_EXTENSIONS). */
export const VIDEO_FILE_EXTENSIONS = ['mp4', 'mkv', 'mov', 'webm', 'm4v', 'avi']

/** `C:\a\b\clip.mp4` → [`C:\a\b`, `clip.mp4`] (Windows or POSIX separators). */
export function splitPath(p: string): [string, string] {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i < 0 ? ['', p] : [p.slice(0, i), p.slice(i + 1)]
}

/** "D:\Video\podcast.mp4" -> "podcast.mp4" */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

/** What a job was made from, for job lists: the YouTube link or the uploaded file's name. */
export function jobSource(job: Job): { kind: 'link' | 'file'; label: string; text: string } {
  if (job.source.type === 'local_file' && job.source.local_file_path) {
    return { kind: 'file', label: tm().status.source.file, text: fileName(job.source.local_file_path) }
  }
  return { kind: 'link', label: tm().status.source.link, text: job.source.youtube_url || '-' }
}

export function isYoutubeUrl(value: string): boolean {
  return /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\/.+/i.test(value.trim())
}

/** { status: { label (getter, current language), tone } } */
function labelled<S extends string>(tones: Record<S, BadgeTone>, label: (s: S) => string): Record<S, { label: string; tone: BadgeTone }> {
  const out = {} as Record<S, { label: string; tone: BadgeTone }>
  for (const s of Object.keys(tones) as S[]) {
    out[s] = {
      tone: tones[s],
      get label() {
        return label(s)
      },
    }
  }
  return out
}
