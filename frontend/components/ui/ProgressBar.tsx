import React from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import { cx } from '@/lib/cx'

interface ProgressBarProps {
  /** 0–100; leave undefined for an indeterminate bar (work is running, amount unknown) */
  value?: number | null
  /** Accessible name, e.g. "Progres job" */
  label?: string
  /** Show the label and percentage above the bar */
  showValue?: boolean
  className?: string
}

/** 8 px bar, ink fill; on ink cards the fill turns leaf (DESIGN.md §8.9). Driven by WS events only. */
export function ProgressBar({ value, label = 'Progres', showValue = false, className }: ProgressBarProps) {
  const known = typeof value === 'number' && isFinite(value)
  const pct = known ? Math.min(100, Math.max(0, value as number)) : 0
  return (
    <div className={className}>
      {showValue && (
        <div className="mc-progress-meta">
          <span className="mc-muted">{label}</span>
          <span className="mc-progress-meta__value">{known ? `${Math.round(pct)}%` : '…'}</span>
        </div>
      )}
      <div
        className={cx('mc-progress', !known && 'mc-progress--indeterminate')}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.round(pct) : undefined}
      >
        <div className="mc-progress__fill" style={known ? { width: `${pct}%` } : undefined} />
      </div>
    </div>
  )
}

interface ProgressRowProps {
  label: React.ReactNode
  value: React.ReactNode
  /** 0–100, width of the fill */
  percent: number
  highlight?: boolean
  className?: string
}

/** Pill row with the label inside and the value on the right (storage, per-agent usage). */
export function ProgressRow({ label, value, percent, highlight, className }: ProgressRowProps) {
  const pct = Math.min(100, Math.max(0, percent || 0))
  return (
    <div className={cx('mc-prow', highlight && 'mc-prow--highlight', className)}>
      <span className="mc-prow__fill" style={{ width: `${pct}%` }} aria-hidden="true" />
      <span className="mc-prow__label">{label}</span>
      <span className="mc-prow__value">{value}</span>
    </div>
  )
}

export type StepState = 'done' | 'active' | 'todo' | 'failed'

interface PipelineStepsProps {
  steps: { id: string; label: string; state: StepState }[]
  className?: string
}

/** Discovery → Analisis → Proses as joined pills (DESIGN.md §8.9). */
export function PipelineSteps({ steps, className }: PipelineStepsProps) {
  return (
    <ol className={cx('mc-steps', className)} style={{ listStyle: 'none' }}>
      {steps.map((step, i) => (
        <li key={step.id} style={{ display: 'contents' }}>
          {i > 0 && <span className={cx('mc-steps__link', steps[i - 1].state === 'done' && 'mc-steps__link--done')} aria-hidden="true" />}
          <span className={cx('mc-step', `mc-step--${step.state}`)} aria-current={step.state === 'active' ? 'step' : undefined}>
            {step.state === 'done' && <Check size={14} aria-hidden="true" />}
            {step.state === 'active' && <span className="mc-spinner mc-spinner--sm" aria-hidden="true" />}
            {step.state === 'failed' && <AlertTriangle size={14} aria-hidden="true" />}
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

interface WizardStepsProps {
  steps: string[]
  /** Index of the current step */
  current: number
  className?: string
}

/** Numbered circles for the Setup Wizard (DESIGN.md §8.21). */
export function WizardSteps({ steps, current, className }: WizardStepsProps) {
  return (
    <ol className={cx('mc-wizard-steps', className)} style={{ listStyle: 'none' }}>
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li key={label} className={cx('mc-wizard-step', `mc-wizard-step--${state}`)} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="mc-wizard-step__dot">{state === 'done' ? <Check size={16} aria-label="Selesai" /> : i + 1}</span>
            <span className="mc-wizard-step__label">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

export default ProgressBar
