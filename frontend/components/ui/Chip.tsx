'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { cx } from '@/lib/cx'

interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  selected?: boolean
  icon?: React.ReactNode
  size?: 'sm' | 'md'
  children: React.ReactNode
}

/** Toggle chip (filters, options). Selected = ink fill with a check. */
export function Chip({ selected = false, icon, size = 'md', className, type = 'button', children, ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx('mc-chip', size === 'sm' && 'mc-chip--sm', className)}
      {...props}
    >
      {selected ? <Check size={14} aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}

/** Static label chip, e.g. clip tags. */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx('mc-chip', 'mc-chip--tag', className)}>{children}</span>
}

export interface ChoiceOption<T extends string> {
  value: T
  label: React.ReactNode
  disabled?: boolean
}

interface ChoiceChipsProps<T extends string> {
  options: ChoiceOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
  className?: string
}

/** Single choice shown as chips (radio group semantics, arrow keys move the choice). */
export function ChoiceChips<T extends string>({ options, value, onChange, ariaLabel, size = 'md', className }: ChoiceChipsProps<T>) {
  const enabled = options.filter((o) => !o.disabled)
  const move = (dir: 1 | -1) => {
    const i = enabled.findIndex((o) => o.value === value)
    const next = enabled[(i + dir + enabled.length) % enabled.length]
    if (next) onChange(next.value)
  }
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx('mc-row', 'mc-row--wrap', 'mc-gap-8', className)}>
      {options.map((opt) => {
        const checked = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={opt.disabled}
            className={cx('mc-chip', size === 'sm' && 'mc-chip--sm')}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(-1)
              }
            }}
          >
            {checked && <Check size={14} aria-hidden="true" />}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

interface GooPairProps {
  first: React.ReactNode
  second: React.ReactNode
  tone?: 'surface' | 'leaf'
  className?: string
}

/** Two same-fill pills joined by a liquid neck, read as one label (DESIGN.md §4.2.5). */
export function GooPair({ first, second, tone = 'surface', className }: GooPairProps) {
  return (
    <span className={cx('mc-goo', tone === 'leaf' && 'mc-goo--leaf', className)}>
      <span className="mc-goo__pill">{first}</span>
      <span className="mc-goo__bridge" aria-hidden="true" />
      <span className="mc-goo__pill">{second}</span>
    </span>
  )
}

export default Chip
