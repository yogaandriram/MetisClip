import React from 'react'
import { cx } from '@/lib/cx'

interface AvatarProps {
  /** Name the initials come from */
  name: string
  /** Stable value for the color (e.g. the agent ID); defaults to the name */
  seed?: string
  size?: number
  src?: string
  className?: string
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = words[0][0] || ''
  const second = words.length > 1 ? words[1][0] : words[0][1] || ''
  return (first + second).toUpperCase()
}

function tone(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 4
}

/** Initials on one of the palette greens, picked by a hash of the seed (DESIGN.md §8.20). */
export function Avatar({ name, seed, size = 40, src, className }: AvatarProps) {
  return (
    <span
      className={cx('mc-avatar', `mc-avatar--t${tone(seed || name)}`, className)}
      style={{ ['--avatar-size' as string]: `${size}px` }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  )
}

export default Avatar
