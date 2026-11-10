import React from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cx } from '@/lib/cx'

export type AlertTone = 'info' | 'success' | 'warning' | 'error'

interface AlertProps {
  tone?: AlertTone
  title?: React.ReactNode
  children?: React.ReactNode
  /** Buttons on the right, e.g. "Coba lagi" */
  action?: React.ReactNode
  icon?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

const ICONS: Record<AlertTone, React.ReactNode> = {
  info: <Info size={18} />,
  success: <CheckCircle2 size={18} />,
  warning: <AlertCircle size={18} />,
  error: <AlertTriangle size={18} />,
}

/**
 * Inline notice. Without red or amber, tone is carried by fill, the icon and an ink outline
 * for errors: info = surface, success = dew, warning = sage, error = surface + 2 px ink ring.
 */
export function Alert({ tone = 'info', title, children, action, icon, className, style }: AlertProps) {
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={cx('mc-alert', tone !== 'info' && `mc-alert--${tone}`, className)}
      style={style}
    >
      <span className="mc-alert__icon" aria-hidden="true">
        {icon || ICONS[tone]}
      </span>
      <div className="mc-alert__body">
        {title && <div className="mc-alert__title">{title}</div>}
        {children && <div className="mc-alert__text">{children}</div>}
      </div>
      {action && <div className="mc-alert__action">{action}</div>}
    </div>
  )
}

export default Alert
