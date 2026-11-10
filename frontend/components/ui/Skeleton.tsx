import React from 'react'
import { cx } from '@/lib/cx'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  /** Match the radius of what is loading */
  radius?: 'sm' | 'md' | 'lg' | 'full'
  circle?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ width = '100%', height = 16, radius = 'sm', circle, className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx('mc-skeleton', className)}
      style={{ width, height, borderRadius: circle ? 'var(--r-full)' : `var(--r-${radius})`, ...style }}
    />
  )
}

export default Skeleton
