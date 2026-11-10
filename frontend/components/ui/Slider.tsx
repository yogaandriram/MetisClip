'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { cx } from '@/lib/cx'
import { Field } from './Field'

interface SliderProps {
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  label?: React.ReactNode
  hint?: React.ReactNode
  /** Formats the value shown next to the track */
  format?: (value: number) => string
  disabled?: boolean
  className?: string
}

/** Range input with an ink fill and the value in mono beside it (DESIGN.md §8.14). */
export function Slider({ min, max, step = 1, value, onChange, label, hint, format, disabled, className }: SliderProps) {
  const id = useId()
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setLocal(value), [value])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // Dragging fires many events; the live preview only needs ~20 updates a second.
  const emit = (next: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(next), 50)
  }

  const pct = max > min ? ((local - min) / (max - min)) * 100 : 0
  const shown = format ? format(local) : local.toFixed(step < 1 ? 1 : 0)

  const control = (
    <div className="mc-slider">
      <input
        id={id}
        type="range"
        className="mc-range"
        min={min}
        max={max}
        step={step}
        value={local}
        disabled={disabled}
        aria-valuetext={shown}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => {
          const next = Number(e.target.value)
          setLocal(next)
          emit(next)
        }}
      />
      <span className="mc-slider__value" aria-hidden="true">
        {shown}
      </span>
    </div>
  )

  if (!label && !hint) return <div className={cx(className)}>{control}</div>
  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      {control}
    </Field>
  )
}

export default Slider
