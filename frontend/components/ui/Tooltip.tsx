import React from 'react'
import { cx } from '@/lib/cx'
import type { TooltipPlacement } from './IconButton'

interface TooltipProps {
  label: string
  placement?: TooltipPlacement
  className?: string
  children: React.ReactNode
}

/**
 * Ink tooltip shown on hover (after 300 ms) and on keyboard focus inside it.
 * It is a hint only: anything essential must also be in an aria-label or visible text.
 */
export function Tooltip({ label, placement = 'top', className, children }: TooltipProps) {
  return (
    <span
      data-tip={label}
      className={cx('mc-tip', placement !== 'top' && `mc-tip--${placement}`, className)}
      style={{ display: 'inline-flex' }}
    >
      {children}
    </span>
  )
}

export default Tooltip
