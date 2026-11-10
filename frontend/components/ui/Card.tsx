'use client'

import React from 'react'
import { cx } from '@/lib/cx'
import { IconTile } from './IconTile'

export type CardTone = 'surface' | 'dew' | 'leaf' | 'ink' | 'dashed'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** surface (default) · dew · leaf (one highlight per screen) · ink (hero, inverted) · dashed (add/drop target) */
  tone?: CardTone
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Lifts on hover; with onClick it also becomes keyboard-operable */
  interactive?: boolean
  selected?: boolean
  as?: 'div' | 'section' | 'article'
}

/** The base container: 28 px radius, no border, no shadow (DESIGN.md §8.6). */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = 'surface', padding = 'md', interactive, selected, as = 'div', className, onClick, onKeyDown, children, ...props },
  ref,
) {
  const clickable = !!onClick
  const Tag = as as 'div'
  return (
    <Tag
      ref={ref}
      className={cx(
        'mc-card',
        tone !== 'surface' && `mc-card--${tone}`,
        tone === 'ink' && 'mc-on-ink',
        padding !== 'md' && `mc-card--pad-${padding}`,
        (interactive || clickable) && 'mc-card--interactive',
        selected && 'mc-card--selected',
        className,
      )}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e: React.KeyboardEvent<HTMLDivElement>) => {
              onKeyDown?.(e)
              if (e.target !== e.currentTarget) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>)
              }
            }
          : onKeyDown
      }
      {...props}
    >
      {children}
    </Tag>
  )
})

interface CardHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Lucide icon element, shown in an ink icon tile */
  icon?: React.ReactNode
  action?: React.ReactNode
  size?: 'md' | 'sm'
  className?: string
}

export function CardHeader({ title, subtitle, icon, action, size = 'md', className }: CardHeaderProps) {
  return (
    <div className={cx('mc-card-head', size === 'sm' && 'mc-card-head--sm', className)}>
      {icon && <IconTile icon={icon} size={size === 'sm' ? 'sm' : 'md'} />}
      <div className="mc-card-head__text">
        <h2 className="mc-card-head__title">{title}</h2>
        {subtitle && <div className="mc-card-head__subtitle">{subtitle}</div>}
      </div>
      {action && <div className="mc-card-head__action">{action}</div>}
    </div>
  )
}

interface SectionBarProps {
  title: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/** Pill header inside a card: title on the left, a real action on the right (DESIGN.md §8.6). */
export function SectionBar({ title, icon, action, className }: SectionBarProps) {
  return (
    <div className={cx('mc-section-bar', className)}>
      <h2 className="mc-section-bar__title">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  )
}

export default Card
