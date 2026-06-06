import React from 'react'

interface GlassCardProps {
  glow?: boolean
  hoverEffect?: boolean
  padding?: string
  style?: React.CSSProperties
  className?: string
  onClick?: () => void
  children: React.ReactNode
}

export const GlassCard: React.FC<GlassCardProps> = ({
  glow = false,
  hoverEffect = true,
  padding = '24px',
  style,
  className = '',
  onClick,
  children
}) => {
  const cardStyle: React.CSSProperties = {
    padding,
    cursor: onClick ? 'pointer' : 'default',
    ...style
  }

  // Combine class names depending on props
  let classes = `glass-panel ${className}`
  if (glow) {
    classes = `glass-card-glowing ${className}`
  }

  // Inline styling additions for hover override if hoverEffect is disabled
  if (!hoverEffect) {
    cardStyle.transform = 'none'
    cardStyle.boxShadow = 'none'
  }

  return (
    <div 
      className={classes} 
      style={cardStyle} 
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export default GlassCard
