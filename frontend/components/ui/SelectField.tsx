'use client'

import React, { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '@/lib/cx'
import { Field } from './Field'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectFieldProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  options: SelectOption[]
  inputSize?: 'sm' | 'md'
  containerClassName?: string
  containerStyle?: React.CSSProperties
}

/** Native select in the pill input style. */
export function SelectField({
  label,
  hint,
  error,
  options,
  inputSize = 'md',
  containerClassName,
  containerStyle,
  className,
  id,
  ...props
}: SelectFieldProps) {
  const autoId = useId()
  const selectId = id || autoId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={selectId} className={containerClassName} style={containerStyle}>
      <div className="mc-control">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          className={cx('mc-input', inputSize === 'sm' && 'mc-input--sm', className)}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="mc-control__chevron" aria-hidden="true">
          <ChevronDown size={16} />
        </span>
      </div>
    </Field>
  )
}

export default SelectField
