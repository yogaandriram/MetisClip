import React from 'react'
import { cx } from '@/lib/cx'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  /** Screen-reader text; omit when a visible label sits next to it */
  label?: string
  className?: string
}

/** Spins only while something real runs. On ink surfaces the arc turns leaf automatically. */
export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  return (
    <span role={label ? 'status' : undefined} className={cx('mc-spinner', size !== 'md' && `mc-spinner--${size}`, className)}>
      {label && <span className="mc-sr-only">{label}</span>}
    </span>
  )
}

export default Spinner
