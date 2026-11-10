'use client'

import React, { useRef } from 'react'
import { cx } from '@/lib/cx'

export interface Tab {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
  /** Accessible name of the tab list */
  ariaLabel?: string
  size?: 'sm' | 'md'
  /** Stretch the segments to the full width */
  block?: boolean
  /** Use when the control sits on the canvas instead of inside a card */
  onCanvas?: boolean
  className?: string
}

/** Segmented control: the active segment is an ink pill (DESIGN.md §8.3). */
export function Tabs({ tabs, activeTab, onChange, ariaLabel, size = 'md', block, onCanvas, className }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const enabled = tabs.filter((t) => !t.disabled)

  const focusMove = (dir: 1 | -1) => {
    const i = enabled.findIndex((t) => t.id === activeTab)
    const next = enabled[(i + dir + enabled.length) % enabled.length]
    if (!next) return
    onChange(next.id)
    refs.current[tabs.indexOf(next)]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx('mc-seg', size === 'sm' && 'mc-seg--sm', block && 'mc-seg--block', onCanvas && 'mc-seg--on-canvas', className)}
    >
      {tabs.map((tab, i) => {
        const active = tab.id === activeTab
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            className="mc-seg__item"
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault()
                focusMove(1)
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                focusMove(-1)
              }
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export default Tabs
