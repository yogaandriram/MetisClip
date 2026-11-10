'use client'

import React, { useId } from 'react'
import { cx } from '@/lib/cx'
import { Field } from './Field'

interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  containerClassName?: string
  containerStyle?: React.CSSProperties
}

export function TextAreaField({ label, hint, error, containerClassName, containerStyle, className, id, ...props }: TextAreaFieldProps) {
  const autoId = useId()
  const areaId = id || autoId
  return (
    <Field label={label} hint={hint} error={error} htmlFor={areaId} className={containerClassName} style={containerStyle}>
      <textarea id={areaId} aria-invalid={error ? true : undefined} className={cx('mc-input', className)} {...props} />
    </Field>
  )
}

export default TextAreaField
