'use client'

import React from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { ButtonLink } from '@/components/ui'
import { cx } from '@/lib/cx'
import { useT } from '@/lib/i18n/I18nProvider'

/** The first-steps guide: Beranda shows it after the Setup Wizard, the help page always. */
export const FIRST_STEPS = ['campaign', 'ai', 'job', 'clip', 'export'] as const
export type FirstStep = (typeof FIRST_STEPS)[number]
export type FirstStepsState = Record<FirstStep, boolean>

const HREF: Record<FirstStep, string> = {
  campaign: '/campaigns/',
  ai: '/settings/',
  job: '/discover/',
  clip: '/clips/',
  export: '/clips/',
}

export function firstStepsDone(state: FirstStepsState): number {
  return FIRST_STEPS.filter((s) => state[s]).length
}

interface FirstStepsProps {
  state: FirstStepsState
  /** A job runs now: the clip step says so */
  running?: boolean
  /** `row`: five columns (Beranda); `list`: one under another (the help page's side column) */
  layout?: 'row' | 'list'
}

/** The steps in order: done ones with a check, the next one with its link, later ones quiet. */
export function FirstSteps({ state, running = false, layout = 'row' }: FirstStepsProps) {
  const t = useT()
  const m = t.help.firstSteps
  const next = FIRST_STEPS.find((s) => !state[s])

  return (
    <ol className={cx('mc-steps', `mc-steps--${layout}`)}>
      {FIRST_STEPS.map((step, i) => {
        const done = state[step]
        const copy = m.steps[step]
        const text = step === 'clip' && !done && running ? m.steps.clip.running : copy.text
        return (
          <li key={step} className="mc-steps__item" data-state={done ? 'done' : step === next ? 'next' : 'todo'}>
            <span className="mc-steps__marker" aria-hidden="true">
              {done ? <Check size={16} strokeWidth={2.5} /> : i + 1}
            </span>
            <div className="mc-steps__body">
              <div className="mc-steps__title">
                {copy.title}
                {done && <span className="mc-sr-only"> ({m.done})</span>}
              </div>
              <p className="mc-steps__text">{text}</p>
              {step === next && (
                <ButtonLink href={HREF[step]} variant="primary" size="sm" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
                  {copy.action}
                </ButtonLink>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default FirstSteps
