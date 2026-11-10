'use client'

import React, { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cx } from '@/lib/cx'
import { Field } from './Field'
import { IconButton } from './IconButton'

interface InputFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  /** Leading icon (18 px) */
  icon?: React.ReactNode
  /** Trailing control inside the pill, e.g. an IconButton size="sm" */
  action?: React.ReactNode
  inputSize?: 'sm' | 'md' | 'lg'
  mono?: boolean
  containerClassName?: string
  containerStyle?: React.CSSProperties
  /** Password fields: control the eye icon from outside (e.g. to fetch a stored value first) */
  revealed?: boolean
  onRevealToggle?: () => void
}

/** Pill text input (DESIGN.md §8.2). type="password" gets an eye toggle. */
export const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  {
    label,
    hint,
    error,
    icon,
    action,
    inputSize = 'md',
    mono,
    containerClassName,
    containerStyle,
    revealed,
    onRevealToggle,
    className,
    type,
    id,
    ...props
  },
  ref,
) {
  const autoId = useId()
  const inputId = id || autoId
  const [ownReveal, setOwnReveal] = useState(false)
  const isPassword = type === 'password'
  const shown = onRevealToggle ? !!revealed : ownReveal
  const trailing = isPassword ? (
    <IconButton
      size="sm"
      variant="ghost"
      label={shown ? 'Sembunyikan' : 'Tampilkan'}
      tooltip="end"
      icon={shown ? <EyeOff size={16} /> : <Eye size={16} />}
      onClick={() => (onRevealToggle ? onRevealToggle() : setOwnReveal((v) => !v))}
    />
  ) : (
    action
  )

  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={containerClassName} style={containerStyle}>
      <div className="mc-control">
        {icon && <span className="mc-control__icon">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          type={isPassword ? (shown ? 'text' : 'password') : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cx(
            'mc-input',
            inputSize !== 'md' && `mc-input--${inputSize}`,
            icon && 'mc-input--with-icon',
            trailing && 'mc-input--with-action',
            mono && 'mc-input--mono',
            className,
          )}
          {...props}
        />
        {trailing && <span className="mc-control__action">{trailing}</span>}
      </div>
    </Field>
  )
})

export default InputField
