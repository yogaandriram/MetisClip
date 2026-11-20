import React from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'
import { useT } from '@/lib/i18n/I18nProvider'

/** Height / width of public/brand/metisclip-logo.png (the owner's logo, trimmed to its outline). */
const LOGO_ASPECT = 193 / 256

/** The MetisClip logo: the ink "m" with leaf fingertips and its white outline, which keeps it clear on
 *  the ink circle. `size` is its width in px. */
export function LogoMark({ size = 42 }: { size?: number }) {
  return (
    <img
      src="/brand/metisclip-logo.png"
      width={size}
      height={Math.round(size * LOGO_ASPECT)}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="mc-logo-mark"
    />
  )
}

interface LogoProps {
  size?: 'sm' | 'md'
  href?: string
  className?: string
}

export function Logo({ size = 'md', href, className }: LogoProps) {
  const t = useT()
  const classes = cx('mc-logo', size === 'sm' && 'mc-logo--sm', className)
  const mark = <LogoMark size={size === 'sm' ? 32 : 42} />
  if (href) {
    return (
      <Link href={href} className={classes} aria-label={t.shell.logoHome}>
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
