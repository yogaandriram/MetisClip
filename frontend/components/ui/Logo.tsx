import React from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'

/** The play mark in leaf on an ink circle. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.2 5.6c0-1.2 1.3-1.9 2.3-1.3l8.6 5.4c1 .6 1 2 0 2.6l-8.6 5.4c-1 .6-2.3-.1-2.3-1.3V5.6Z" fill="currentColor" />
      <circle cx="5" cy="18.5" r="2" fill="currentColor" />
    </svg>
  )
}

interface LogoProps {
  size?: 'sm' | 'md'
  href?: string
  className?: string
}

export function Logo({ size = 'md', href, className }: LogoProps) {
  const classes = cx('mc-logo', size === 'sm' && 'mc-logo--sm', className)
  const mark = <LogoMark size={size === 'sm' ? 20 : 26} />
  if (href) {
    return (
      <Link href={href} className={classes} aria-label="MetisClip, ke Beranda">
        {mark}
      </Link>
    )
  }
  return (
    <span className={classes} role="img" aria-label="MetisClip">
      {mark}
    </span>
  )
}

export default Logo
