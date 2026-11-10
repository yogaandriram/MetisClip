'use client'

import React, { useId } from 'react'
import { cx } from '@/lib/cx'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: React.ReactNode
  hint?: React.ReactNode
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

/** On = ink track with a leaf knob (DESIGN.md §8.14). */
export function ToggleSwitch({ checked, onChange, label, hint, disabled = false, className, style }: ToggleSwitchProps) {
  const id = useId()
  const toggle = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={hint ? `${id}-hint` : undefined}
      disabled={disabled}
      className="mc-switch"
      onClick={() => onChange(!checked)}
    />
  )
  if (!label) return <span className={className} style={style}>{toggle}</span>
  return (
    <div className={cx('mc-switch-row', disabled && 'mc-switch-row--disabled', className)} style={style}>
      <label htmlFor={id} className="mc-switch-row__text">
        <span className="mc-switch-row__label">{label}</span>
        {hint && (
          <span className="mc-switch-row__hint" id={`${id}-hint`} style={{ display: 'block' }}>
            {hint}
          </span>
        )}
      </label>
      {toggle}
    </div>
  )
}

export default ToggleSwitch
