'use client'

import React from 'react'
import { Alert, Button, Field, Slider } from '@/components/ui'
import type { CaptionStyle } from '@/lib/presets/defaults'
import { useT } from '@/lib/i18n/I18nProvider'
import {
  CENTER_X,
  DESIGN_CANVAS,
  PLATFORM_LABELS,
  POSITION_LIMITS,
  type QuickPosition,
  coveredBy,
  moveIntoSafeArea,
  quickPosition,
} from '@/lib/presets/position'

export type CaptionPositionUpdate = Partial<Pick<CaptionStyle, 'positionX' | 'positionY'>>

interface CaptionPositionControlsProps {
  style: Pick<CaptionStyle, 'positionX' | 'positionY' | 'fontSize' | 'lineHeight'>
  /** AI emojis are on: the emoji above the words makes the caption taller */
  emoji: boolean
  /** `coalesceKey` lets an undo history merge the many updates of one slider drag */
  onChange: (updates: CaptionPositionUpdate, coalesceKey?: string) => void
}

const QUICK: QuickPosition[] = ['top', 'middle', 'bottom']

/**
 * Caption position: quick spots inside the area every platform leaves free, fine sliders, and
 * whether TikTok, IG Reels or YT Shorts would cover part of the caption (lib/presets/position.ts).
 */
export function CaptionPositionControls({ style, emoji, onChange }: CaptionPositionControlsProps) {
  const t = useT()
  const m = t.captions
  const covered = coveredBy(style, emoji)
  const current = QUICK.find((q) => {
    const p = quickPosition(q, style, emoji)
    return Math.round(style.positionX) === p.positionX && Math.round(style.positionY) === p.positionY
  })

  return (
    <div className="mc-stack">
      <Field label={m.quickLabel} hint={m.quickHint}>
        <div role="group" aria-label={m.quickGroup} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--s-2)' }}>
          {QUICK.map((q) => (
            <Button
              key={q}
              size="sm"
              variant={current === q ? 'primary' : 'secondary'}
              aria-pressed={current === q}
              onClick={() => onChange(quickPosition(q, style, emoji))}
            >
              {m.quick[q]}
            </Button>
          ))}
        </div>
      </Field>

      <Slider
        label={m.vertical}
        min={POSITION_LIMITS.y.min}
        max={POSITION_LIMITS.y.max}
        value={Math.round(style.positionY)}
        hint={m.verticalHint}
        format={(v) => `${Math.round((v / DESIGN_CANVAS.height) * 100)}%`}
        onChange={(v) => onChange({ positionY: v }, 'positionY')}
      />
      <Slider
        label={m.horizontal}
        min={POSITION_LIMITS.x.min}
        max={POSITION_LIMITS.x.max}
        value={Math.round(style.positionX)}
        hint={m.horizontalHint(Math.round((CENTER_X / DESIGN_CANVAS.width) * 100))}
        format={(v) => `${Math.round((v / DESIGN_CANVAS.width) * 100)}%`}
        onChange={(v) => onChange({ positionX: v }, 'positionX')}
      />

      {covered.length === 0 ? (
        <Alert tone="success" title={m.safeTitle}>
          {m.safeBody}
        </Alert>
      ) : (
        <Alert
          tone="warning"
          title={m.coveredTitle(m.listJoin(covered.map((p) => PLATFORM_LABELS[p])))}
          action={
            <Button size="sm" variant="secondary" onClick={() => onChange(moveIntoSafeArea(style, emoji))}>
              {m.moveToSafe}
            </Button>
          }
        >
          {m.coveredBody}
        </Alert>
      )}
    </div>
  )
}

export default CaptionPositionControls
