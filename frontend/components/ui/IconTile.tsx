import React from 'react'
import { cx } from '@/lib/cx'

interface IconTileProps {
  icon: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
}

/** Ink square with two leaf corner dots that marks a card's topic (DESIGN.md §8.7). */
export function IconTile({ icon, size = 'md', className }: IconTileProps) {
  return (
    <span className={cx('mc-tile', size === 'sm' && 'mc-tile--sm', className)} aria-hidden="true">
      {icon}
    </span>
  )
}

export default IconTile
