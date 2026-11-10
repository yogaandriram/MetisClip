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
 * Ink rail with the liquid "bite" that marks the active item (DESIGN.md §4.2.1, §5.2).
 * Sistem sits alone at the bottom as a white circle.
 */
export function NavRail({ items, pathname, systemHint, systemProblem }: NavRailProps) {
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const activeIndex = items.findIndex((item) => isActive(pathname, item.href))
  const [biteY, setBiteY] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = activeIndex >= 0 ? itemRefs.current[activeIndex] : null
    setBiteY(el ? el.offsetTop + el.offsetHeight / 2 : null)
  }, [activeIndex])

  const systemActive = isActive(pathname, '/system/')

  return (
    <nav className="mc-rail" aria-label="Navigasi utama">
      <svg
        className="mc-rail__bite"
        viewBox="0 -56 66 112"
        aria-hidden="true"
        style={{ ['--bite-y' as string]: `${biteY ?? 0}px`, opacity: biteY === null ? 0 : 1 }}
      >
        <path d="M66 56H64C64 34 50 26 36 26A26 26 0 0 1 36 -26C50 -26 64 -34 64 -56H66Z" />
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
