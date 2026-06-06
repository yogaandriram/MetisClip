import React from 'react'

interface BadgeProps {
  variant?: 'primary' | 'accent' | 'warning' | 'danger' | 'muted'
  glow?: boolean
  icon?: React.ReactNode
  style?: React.CSSProperties
  className?: string
  children: React.ReactNode
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'primary',
  glow = true,
  icon,
  style,
  className = '',
  children
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'accent':
        return {
          background: 'rgba(7, 202, 107, 0.1)',
          border: '1px solid var(--accent)',
          color: 'var(--accent)',
          glowShadow: '0 0 12px var(--accent-glow)'
        }
      case 'warning':
        return {
          background: 'rgba(232, 149, 88, 0.1)',
          border: '1px solid var(--warning)',
          color: 'var(--warning)',
          glowShadow: '0 0 12px rgba(232, 149, 88, 0.2)'
        }
      case 'danger':
        return {
          background: 'rgba(234, 33, 67, 0.1)',
          border: '1px solid var(--danger)',
          color: 'var(--danger)',
          glowShadow: '0 0 12px rgba(234, 33, 67, 0.2)'
        }
      case 'muted':
        return {
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border-glass)',
          color: 'var(--text-muted)',
          glowShadow: 'none'
        }
      case 'primary':
      default:
        return {
          background: 'rgba(24, 86, 255, 0.1)',
          border: '1px solid var(--primary)',
          color: 'var(--primary)',
          glowShadow: '0 0 12px var(--primary-glow)'
        }
    }
  }

  const activeStyles = getVariantStyles()
  const combinedStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 12px',
    borderRadius: '20px', // Capsule styling per DESIGN.md
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    background: activeStyles.background,
    border: activeStyles.border,
    color: activeStyles.color,
    boxShadow: glow ? activeStyles.glowShadow : 'none',
    ...style
  }

  return (
    <div className={className} style={combinedStyles}>
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      <span>{children}</span>
    </div>
  )
}

export default Badge
