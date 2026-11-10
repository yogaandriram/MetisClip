import React from 'react'
import { cx } from '@/lib/cx'

/** Hairline separator. */
export function Divider({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <hr className={cx('mc-divider', className)} style={style} />
}

/** Keyboard key, e.g. <Kbd>Ctrl + S</Kbd>. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mc-kbd">{children}</kbd>
}

export interface KeyValueItem {
  key: React.ReactNode
  value: React.ReactNode
  id?: string
}

/** Label on the left, value on the right, hairline between rows (system info, details). */
export function KeyValueList({ items, className }: { items: KeyValueItem[]; className?: string }) {
  return (
    <dl className={cx('mc-kv', className)}>
      {items.map((item, i) => (
        <div key={item.id || i} className="mc-kv__row">
          <dt className="mc-kv__key">{item.key}</dt>
          <dd className="mc-kv__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Ink surface for video previews (clip editor, Brand Template). Text tokens switch to on-ink inside. */
export function Stage({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cx('mc-stage', 'mc-on-ink', className)} style={style}>
      {children}
    </div>
  )
}
