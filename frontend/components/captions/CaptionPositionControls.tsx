'use client'

import React from 'react'
import { Alert, Button, Field, Slider } from '@/components/ui'
import type { CaptionStyle } from '@/lib/presets/defaults'
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

const QUICK: { id: QuickPosition; label: string }[] = [
  { id: 'top', label: 'Atas' },
  { id: 'middle', label: 'Tengah' },
  { id: 'bottom', label: 'Bawah' },
]

const listJoin = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} dan ${items[items.length - 1]}`)

/**
 * Caption position: quick spots inside the area every platform leaves free, fine sliders, and
 * whether TikTok, IG Reels or YT Shorts would cover part of the caption (lib/presets/position.ts).
 */
export function CaptionPositionControls({ style, emoji, onChange }: CaptionPositionControlsProps) {
  const covered = coveredBy(style, emoji)
  const current = QUICK.find((q) => {
    const p = quickPosition(q.id, style, emoji)
    return Math.round(style.positionX) === p.positionX && Math.round(style.positionY) === p.positionY
  })?.id

  return (
    <div className="mc-stack">
      <Field label="Posisi cepat" hint="Ketiganya berada di area yang tidak tertutup tampilan TikTok, IG Reels, dan YT Shorts.">
        <div role="group" aria-label="Posisi cepat caption" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--s-2)' }}>
          {QUICK.map((q) => (
            <Button
              key={q.id}
              size="sm"
              variant={current === q.id ? 'primary' : 'secondary'}
              aria-pressed={current === q.id}
              onClick={() => onChange(quickPosition(q.id, style, emoji))}
            >
              {q.label}
            </Button>
          ))}
        </div>
      </Field>

      <Slider
        label="Posisi vertikal"
        min={POSITION_LIMITS.y.min}
        max={POSITION_LIMITS.y.max}
        value={Math.round(style.positionY)}
        hint="Jarak bagian bawah caption dari bawah video."
        format={(v) => `${Math.round((v / DESIGN_CANVAS.height) * 100)}%`}
        onChange={(v) => onChange({ positionY: v }, 'positionY')}
      />
      <Slider
        label="Posisi horizontal"
        min={POSITION_LIMITS.x.min}
        max={POSITION_LIMITS.x.max}
        value={Math.round(style.positionX)}
        hint={`${Math.round((CENTER_X / DESIGN_CANVAS.width) * 100)}% = tengah video.`}
        format={(v) => `${Math.round((v / DESIGN_CANVAS.width) * 100)}%`}
        onChange={(v) => onChange({ positionX: v }, 'positionX')}
      />

      {covered.length === 0 ? (
        <Alert tone="success" title="Aman di semua platform">
          Caption tidak tertutup judul, keterangan, atau tombol TikTok, IG Reels, dan YT Shorts.
        </Alert>
      ) : (
        <Alert
          tone="warning"
          title={`Bisa tertutup tampilan ${listJoin(covered.map((p) => PLATFORM_LABELS[p]))}`}
          action={
            <Button size="sm" variant="secondary" onClick={() => onChange(moveIntoSafeArea(style, emoji))}>
              Pindahkan ke area aman
            </Button>
          }
        >
          Sebagian caption berada di area judul, keterangan, atau tombol aplikasi tersebut.
        </Alert>
      )}
    </div>
  )
}

export default CaptionPositionControls
