import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '@/lib/cx'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  /** Say why it is empty */
  description?: React.ReactNode
  /** The one action that fills it */
  action?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function EmptyState({ icon: Icon, title, description, action, className, style }: EmptyStateProps) {
  return (
    <div className={cx('mc-empty', className)} style={style}>
      <span className="mc-empty__icon" aria-hidden="true">
        <Icon size={24} />
      </span>
      <h3 className="mc-empty__title">{title}</h3>
      {description && <div className="mc-empty__text">{description}</div>}
      {action && <div className="mc-empty__action">{action}</div>}
    </div>
  )
}

export default EmptyState
