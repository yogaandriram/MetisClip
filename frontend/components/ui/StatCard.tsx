import React from 'react'
import { cx } from '@/lib/cx'
import { Card, type CardTone } from './Card'
import { Blob, Notch, Tilt } from './Decoration'

interface StatCardProps {
  /** Real engine data only; show 0 plus a next step instead of a made-up number */
  value: React.ReactNode
  label: React.ReactNode
  icon?: React.ReactNode
  notchTone?: 'leaf' | 'ink'
  tone?: Extract<CardTone, 'surface' | 'dew' | 'leaf'>
  /** Corner blob (≤ 2 per screen, overview screens only) */
  blob?: boolean
  /** Rotated over a dashed outline (≤ 1 per screen) */
  tilt?: boolean
  className?: string
  footer?: React.ReactNode
}

/** Big number + label in the bottom-left, notch badge on the top-left corner (DESIGN.md §8.8). */
export function StatCard({ value, label, icon, notchTone = 'leaf', tone = 'surface', blob, tilt, className, footer }: StatCardProps) {
  const card = (
    <Card tone={tone} className={cx('mc-stat', !tilt && className)}>
      {blob && <Blob />}
      {icon && <Notch icon={icon} tone={notchTone} />}
      <div className="mc-card__body">
        <div className="mc-stat__value">{value}</div>
        <div className="mc-stat__label">{label}</div>
        {footer && <div style={{ marginTop: 12 }}>{footer}</div>}
      </div>
    </Card>
  )
  return tilt ? <Tilt className={className}>{card}</Tilt> : card
}

export default StatCard
