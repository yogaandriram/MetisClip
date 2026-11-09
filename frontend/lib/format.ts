// Small formatting helpers shared by the desktop UI (Bahasa Indonesia).
import { EngineError, type ClipStatus, type JobStatus, type JobStep, type RenderStatus } from './engine'

type BadgeVariant = 'primary' | 'accent' | 'warning' | 'danger' | 'muted'

export function errorMessage(err: unknown, fallback = 'Terjadi kesalahan yang tidak terduga'): string {
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
  return `${value.toLocaleString('id-ID', { maximumFractionDigits: value >= 100 ? 0 : 1 })} ${units[i]}`
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
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatCompactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (n >= 1_000) return `${(n / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb`
  return n.toLocaleString('id-ID')
}

export const JOB_STEPS: { id: JobStep; label: string }[] = [
  { id: 'discovery', label: 'Mencari video sumber di YouTube' },
  { id: 'analysis', label: 'Menganalisis transkrip & memilih momen viral' },
  { id: 'processing', label: 'Memotong klip, crop wajah & membuat subtitle' },
]

export function jobStepLabel(step: JobStep | null | undefined): string {
  return JOB_STEPS.find((s) => s.id === step)?.label || 'Menunggu antrian'
}

export const JOB_STATUS: Record<JobStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Menunggu', variant: 'muted' },
  running: { label: 'Berjalan', variant: 'primary' },
  interrupted: { label: 'Terputus', variant: 'warning' },
  cancelled: { label: 'Dibatalkan', variant: 'muted' },
  completed: { label: 'Selesai', variant: 'accent' },
  failed: { label: 'Gagal', variant: 'danger' },
}

export const ACTIVE_JOB_STATUSES: JobStatus[] = ['pending', 'running']
export const RESUMABLE_JOB_STATUSES: JobStatus[] = ['interrupted', 'failed', 'cancelled']

export const CLIP_STATUS: Record<ClipStatus, { label: string; variant: BadgeVariant }> = {
  processing: { label: 'Diproses', variant: 'warning' },
  ready: { label: 'Siap', variant: 'accent' },
  rendering: { label: 'Dirender', variant: 'primary' },
  exported: { label: 'Diekspor', variant: 'accent' },
  failed: { label: 'Gagal', variant: 'danger' },
}

export const RENDER_STATUS: Record<RenderStatus, string> = {
  queued: 'Menunggu antrian render…',
  rendering: 'Membakar subtitle ke video…',
  completed: 'Video selesai dirender',
  failed: 'Render gagal',
  cancelled: 'Render dibatalkan',
}

export const CLIP_DURATION_OPTIONS = [
  { value: '30-45', label: '30 - 45 detik (Ultra Short)' },
  { value: '45-60', label: '45 - 60 detik (Shorts/Reels)' },
  { value: '60-75', label: '60 - 75 detik (Story)' },
  { value: '75-90', label: '75 - 90 detik (Deep-dive)' },
]

// Same values the web app sent; the engine uses video_types[0] for search + crop mode.
export const VIDEO_TYPE_OPTIONS = [
  { value: 'podcast', label: 'Podcast (fokus tengah)' },
  { value: 'talking_head', label: 'Talking head (fokus tengah)' },
]

/** Splits "a, b ,c" into ['a','b','c'] */
export function splitKeywords(value: string | null | undefined): string[] {
  return (value || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

export function isYoutubeUrl(value: string): boolean {
  return /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\/.+/i.test(value.trim())
}
