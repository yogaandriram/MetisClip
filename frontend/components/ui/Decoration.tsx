'use client'

import React from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'

/*
 * Organic motifs (DESIGN.md §4.2). Each one has a dose cap: blob ≤ 2 per screen, contour ≤ 1,
 * notch ≤ 4, tilt ≤ 1, and none of them on work screens (editor, settings, tables).
 */

/** Three nested shapes in the card's top-right corner. Put it first inside a Card; keep text bottom-left. */
export function Blob() {
  return (
    <div className="mc-deco" aria-hidden="true">
      <svg className="mc-blob" viewBox="0 0 200 200">
        <path className="mc-blob__1" d="M52 0H200V150C184 166 158 164 144 146C130 128 106 130 90 114C72 96 84 72 72 50C62 32 46 18 52 0Z" />
        <path className="mc-blob__2" d="M88 0H200V112C188 124 168 122 158 108C148 94 128 96 118 82C106 66 116 46 106 30C98 18 84 12 88 0Z" />
        <path className="mc-blob__3" d="M124 0H200V72C192 80 178 80 172 70C166 60 152 60 146 50C138 38 146 24 138 14C134 8 124 6 124 0Z" />
      </svg>
    </div>
  )
}

/** Topographic lines for the ink hero card. */
export function Contour() {
  return (
    <div className="mc-deco" aria-hidden="true">
      <svg className="mc-contour" viewBox="0 0 300 200" preserveAspectRatio="none">
        <path d="M-20 160C40 120 80 190 140 150S240 90 320 130" />
        <path d="M-20 130C40 90 80 160 140 120S240 60 320 100" />
        <path d="M-20 100C40 60 80 130 140 90S240 30 320 70" />
        <path d="M-20 70C40 30 80 100 140 60S240 0 320 40" />
      </svg>
    </div>
  )
}

interface NotchProps {
  icon: React.ReactNode
  tone?: 'leaf' | 'ink'
  position?: 'start' | 'end'
  size?: 'sm' | 'md'
  /** Needed when the notch is a link or a button */
  label?: string
  href?: string
  onClick?: () => void
  className?: string
}

/** Icon circle that sits in a cut-out at a card's corner. The card must not clip overflow. */
export function Notch({ icon, tone = 'leaf', position = 'start', size = 'md', label, href, onClick, className }: NotchProps) {
  const classes = cx(
    'mc-notch',
    tone === 'ink' && 'mc-notch--ink',
    position === 'end' && 'mc-notch--end',
    size === 'sm' && 'mc-notch--sm',
    (href || onClick) && label && 'mc-tip',
    className,
  )
  if (href) {
    return (
      <Link href={href} className={classes} aria-label={label} data-tip={label}>
        {icon}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={classes} aria-label={label} data-tip={label} onClick={onClick}>
        {icon}
      </button>
    )
  }
  return (
    <span className={classes} aria-hidden="true">
      {icon}
    </span>
  )
}

/** Dashed "home" outline with the card rotated a few degrees inside it. One per overview screen. */
export function Tilt({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('mc-tilt', className)}>{children}</div>
}
