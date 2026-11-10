'use client'

import React, { useId } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Field } from './Field'
import { IconButton } from './IconButton'

interface NumberStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: React.ReactNode
  hint?: React.ReactNode
  /** Text for a value, e.g. 0 -> "Tanpa batas" */
  format?: (value: number) => string
  /** Accessible name; defaults to the label when it is plain text */
  ariaLabel?: string
  className?: string
}

/** − value + in a pill (DESIGN.md §8.2). */
export function NumberStepper({ value, onChange, min = 0, max = 99, step = 1, label, hint, format, ariaLabel, className }: NumberStepperProps) {
  const id = useId()
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const text = format ? format(value) : String(value)
  return (
    <Field label={label} hint={hint} className={className}>
      <div
        className="mc-stepper"
        role="spinbutton"
        id={id}
        tabIndex={0}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={text}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault()
            onChange(clamp(value + step))
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault()
            onChange(clamp(value - step))
          }
        }}
      >
        <IconButton size="sm" variant="ghost" label="Kurangi" icon={<Minus size={16} />} disabled={value <= min} onClick={() => onChange(clamp(value - step))} tabIndex={-1} />
        <span className="mc-stepper__value">{text}</span>
        <IconButton size="sm" variant="ghost" label="Tambah" icon={<Plus size={16} />} disabled={value >= max} onClick={() => onChange(clamp(value + step))} tabIndex={-1} />
      </div>
    </Field>
  )
}

export default NumberStepper
