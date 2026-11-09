import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  style?: React.CSSProperties
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action, style }) => (
  <div
    style={{
      textAlign: 'center',
      padding: '56px 20px',
      border: '1px dashed var(--border-glass)',
      borderRadius: '16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px',
      ...style,
    }}
  >
    <Icon size={44} color="var(--text-muted)" style={{ opacity: 0.6, marginBottom: '6px' }} />
    <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{title}</h3>
    {description && <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '460px', lineHeight: 1.6 }}>{description}</p>}
    {action && <div style={{ marginTop: '12px' }}>{action}</div>}
  </div>
)

export default EmptyState
