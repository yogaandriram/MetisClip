import React from 'react'
import { AlertTriangle, Check, Clock, PauseCircle, X } from 'lucide-react'
import { cx } from '@/lib/cx'
import { CLIP_STATUS, JOB_STATUS } from '@/lib/format'
import { useT } from '@/lib/i18n/I18nProvider'
import type { ClipStatus, JobStatus, RenderStatus } from '@/lib/engine'

/**
 * neutral · quiet (cancelled, inactive) · success · accent (ready, the thing to act on)
 * · ink (running) · warning (interrupted) · error (failed). Always pair with an icon or word.
 */
export type BadgeTone = 'neutral' | 'quiet' | 'success' | 'accent' | 'ink' | 'warning' | 'error'

interface BadgeProps {
  tone?: BadgeTone
  icon?: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
  title?: string
  children: React.ReactNode
}

export function Badge({ tone = 'neutral', icon, size = 'md', className, title, children }: BadgeProps) {
  return (
    <span className={cx('mc-badge', `mc-badge--${tone}`, size === 'sm' && 'mc-badge--sm', className)} title={title}>
      {icon}
      {children}
    </span>
  )
}

const TONE_ICON: Record<BadgeTone, React.ReactNode> = {
  neutral: <Clock size={14} aria-hidden="true" />,
  quiet: <X size={14} aria-hidden="true" />,
  success: <Check size={14} aria-hidden="true" />,
  accent: <Check size={14} aria-hidden="true" />,
  ink: <span className="mc-spinner mc-spinner--sm" aria-hidden="true" />,
  warning: <PauseCircle size={14} aria-hidden="true" />,
  error: <AlertTriangle size={14} aria-hidden="true" />,
}

const RENDER_TONE: Record<RenderStatus, BadgeTone> = {
  queued: 'neutral',
  rendering: 'ink',
  completed: 'success',
  failed: 'error',
  cancelled: 'quiet',
}

type StatusBadgeProps =
  | { kind: 'job'; status: JobStatus; size?: 'sm' | 'md'; className?: string }
  | { kind: 'clip'; status: ClipStatus; size?: 'sm' | 'md'; className?: string }
  | { kind: 'render'; status: RenderStatus; size?: 'sm' | 'md'; className?: string }

/** Job, clip or render status with its standard tone, icon and label in the current language. */
export function StatusBadge(props: StatusBadgeProps) {
  const t = useT()
  const meta =
    props.kind === 'job'
      ? JOB_STATUS[props.status]
      : props.kind === 'clip'
        ? CLIP_STATUS[props.status]
        : RENDER_TONE[props.status] && { tone: RENDER_TONE[props.status], label: t.status.renderBadge[props.status] }
  if (!meta) return null
  return (
    <Badge tone={meta.tone} icon={TONE_ICON[meta.tone]} size={props.size} className={props.className}>
      {meta.label}
    </Badge>
  )
}

interface ScoreBadgeProps {
  score: number | null | undefined
  size?: 'sm' | 'md'
  className?: string
  /** A moment the user chose: no score, a "Manual" mark instead */
  manual?: boolean
}

/** Viral score: ≥ 80 leaf, 60–79 dew, below 60 outlined (DESIGN.md §8.5). */
export function ScoreBadge({ score, size = 'md', className, manual = false }: ScoreBadgeProps) {
  const t = useT()
  if (manual) {
    return (
      <span className={cx('mc-tip', className)} data-tip={t.ui.manualClipTip}>
        <Badge tone="neutral" size={size}>
          {t.ui.manualClip}
        </Badge>
      </span>
    )
  }
  const value = Math.round(score ?? 0)
  const level = value >= 80 ? 'high' : value >= 60 ? 'mid' : 'low'
  return (
    <span
      className={cx('mc-score', `mc-score--${level}`, size === 'sm' && 'mc-score--sm', 'mc-tip', className)}
      data-tip={t.ui.viralScore}
      aria-label={t.ui.viralScoreValue(value)}
      role="img"
    >
      {value}
    </span>
  )
}

export default Badge
