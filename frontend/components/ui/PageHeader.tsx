import React from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '32px', flexWrap: 'wrap' }}>
    <div style={{ minWidth: 0 }}>
      <h1 style={{ fontSize: '30px', fontWeight: 800, marginBottom: '8px' }}>{title}</h1>
      {subtitle && <p style={{ color: 'var(--text-dim)', fontSize: '15px', lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
    {actions && <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
  </div>
)

export default PageHeader
