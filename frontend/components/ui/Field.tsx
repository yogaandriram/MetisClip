import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { cx } from '@/lib/cx'

interface FieldProps {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  /** id of the control, links the label to it */
  htmlFor?: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

/** Label above, control, then hint or error below (DESIGN.md §8.2). */
export function Field({ label, hint, error, htmlFor, className, style, children }: FieldProps) {
  return (
    <div className={cx('mc-field', className)} style={style}>
      {label && (
        <label className="mc-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <span className="mc-field__error" role="alert" id={htmlFor ? `${htmlFor}-error` : undefined}>
          <AlertTriangle size={14} aria-hidden="true" />
          {error}
        </span>
      ) : (
        hint && (
          <span className="mc-field__hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>
            {hint}
          </span>
        )
      )}
    </div>
  )
}

export default Field
