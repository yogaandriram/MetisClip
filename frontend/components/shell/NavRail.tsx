'use client'

import React, { useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { HardDrive } from 'lucide-react'
import { cx } from '@/lib/cx'

export interface RailItem {
  name: string
  href: string
  icon: LucideIcon
  count?: number
}

interface NavRailProps {
  items: RailItem[]
  /** Normalized current path, e.g. "/clips" */
  pathname: string
  systemHint: string
  systemProblem: boolean
}

export function normalizePath(path: string | null): string {
  if (!path) return '/'
  const p = path.replace(/\/+$/, '')
  return p || '/'
}

function isActive(pathname: string, href: string) {
  const base = normalizePath(href)
  return pathname === base || pathname.startsWith(`${base}/`)
}

/**
 * The bite (DESIGN.md §4.2.1): a hole of radius 26 around the active item, joined to the rail's
 * straight edge (x = 64) by two fillet arcs of radius 20 that are tangent to both. The tails end at
 * y = ±45.3 with a vertical tangent. The rail's top padding keeps them below the rounded cap.
 */
const BITE_PATH = 'M66 45.3H64A20 20 0 0 0 40.52 25.6A26 26 0 1 1 40.52 -25.6A20 20 0 0 0 64 -45.3H66Z'

/**
 * Ink rail with the liquid "bite" that marks the active item (DESIGN.md §4.2.1, §5.2).
 * Sistem sits alone at the bottom as a white circle.
 */
export function NavRail({ items, pathname, systemHint, systemProblem }: NavRailProps) {
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const activeIndex = items.findIndex((item) => isActive(pathname, item.href))
  const [biteY, setBiteY] = useState<number | null>(null)
  // Where the bite last was: it fades out and back in there (e.g. via Sistem) instead of
  // sliding in from the rail's top edge
  const lastBiteY = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = activeIndex >= 0 ? itemRefs.current[activeIndex] : null
    const y = el ? el.offsetTop + el.offsetHeight / 2 : null
    if (y !== null) lastBiteY.current = y
    setBiteY(y)
  }, [activeIndex])

  const systemActive = isActive(pathname, '/system/')
  const shownY = biteY ?? lastBiteY.current

  return (
    <nav className="mc-rail" aria-label="Navigasi utama">
      <svg
        className="mc-rail__bite"
        viewBox="0 -46 66 92"
        aria-hidden="true"
        // The spring overshoots by ~10 % of the distance; gliding up to the first item it would push
        // the bite into the rail's rounded top for a moment, so that glide eases out without overshoot
        data-edge={activeIndex === 0 ? 'top' : undefined}
        style={{ ['--bite-y' as string]: shownY === null ? undefined : `${shownY}px`, opacity: biteY === null ? 0 : 1 }}
      >
        <path d={BITE_PATH} />
        <circle cx="36" cy="0" r="22" />
      </svg>

      {items.map((item, i) => {
        const active = i === activeIndex
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            href={item.href}
            aria-label={item.count ? `${item.name}, ${item.count} berjalan` : item.name}
            aria-current={active ? 'page' : undefined}
            data-tip={item.name}
            className="mc-rail__item mc-tip mc-tip--right"
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            {!!item.count && <span className="mc-rail__count">{item.count}</span>}
          </Link>
        )
      })}

      <div className="mc-rail__spacer" />

      <Link
        href="/system/"
        aria-label={`Sistem. ${systemHint}`}
        aria-current={systemActive ? 'page' : undefined}
        data-tip={systemHint}
        className={cx('mc-rail__system', 'mc-tip', 'mc-tip--right')}
      >
        <HardDrive size={20} strokeWidth={1.75} aria-hidden="true" />
        {systemProblem && <span className="mc-rail__alert" aria-hidden="true" />}
      </Link>
    </nav>
  )
}

export default NavRail
