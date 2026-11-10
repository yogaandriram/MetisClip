'use client'

import React, { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { cx } from '@/lib/cx'
import { useDismiss } from '@/hooks/useDismiss'

export interface DropdownItem {
  id: string
  label: React.ReactNode
  icon?: React.ElementType
  onClick?: () => void
  href?: string
  /** Destructive: separated by a line, shown in bold */
  danger?: boolean
  selected?: boolean
  disabled?: boolean
}

interface DropdownProps {
  /** Rendered inside the toggle button; give it visible text or pass triggerLabel */
  trigger: React.ReactNode
  triggerLabel?: string
  triggerClassName?: string
  items: DropdownItem[]
  align?: 'left' | 'right'
  width?: number | string
  header?: React.ReactNode
  footer?: React.ReactNode
}

/** Menu popover (DESIGN.md §8.11). */
export function Dropdown({ trigger, triggerLabel, triggerClassName, items, align = 'left', width = 220, header, footer }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const list = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'))
    const i = list.indexOf(document.activeElement as HTMLElement)
    const next = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]
    next?.focus()
  }

  const normal = items.filter((i) => !i.danger)
  const danger = items.filter((i) => i.danger)

  const renderItem = (item: DropdownItem) => {
    const Icon = item.icon
    const content = (
      <>
        {Icon && <Icon size={16} aria-hidden="true" />}
        <span className="mc-grow">{item.label}</span>
        {item.selected && <Check size={16} className="mc-menu-item__check" aria-hidden="true" />}
      </>
    )
    const classes = cx('mc-menu-item', item.selected && 'mc-menu-item--selected', item.danger && 'mc-menu-item--danger')
    if (item.href) {
      return (
        <Link key={item.id} href={item.href} role="menuitem" className={classes} onClick={close}>
          {content}
        </Link>
      )
    }
    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        className={classes}
        disabled={item.disabled}
        aria-disabled={item.disabled || undefined}
        onClick={() => {
          item.onClick?.()
          close()
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <div ref={root} className="mc-popover-anchor">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        className={triggerClassName}
        style={triggerClassName ? undefined : { all: 'unset', cursor: 'pointer', display: 'inline-flex' }}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div role="menu" className={cx('mc-popover', align === 'right' && 'mc-popover--end')} style={{ width }} onKeyDown={onMenuKey}>
          {header}
          {normal.map(renderItem)}
          {danger.length > 0 && normal.length > 0 && <div className="mc-menu-sep" role="separator" />}
          {danger.map(renderItem)}
          {footer}
        </div>
      )}
    </div>
  )
}

export default Dropdown
