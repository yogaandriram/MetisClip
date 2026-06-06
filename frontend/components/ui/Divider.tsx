import React from 'react'

interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  style?: React.CSSProperties
  className?: string
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  style,
  className = ''
}) => {
  const combinedStyles: React.CSSProperties = {
    background: 'var(--border-glass)',
    flexShrink: 0,
    ...style
  }

  if (orientation === 'horizontal') {
    combinedStyles.width = '100%'
    combinedStyles.height = '1px'
    combinedStyles.margin = '20px 0'
  } else {
    combinedStyles.height = '100%'
    combinedStyles.width = '1px'
    combinedStyles.margin = '0 20px'
  }

  return <div className={className} style={combinedStyles} />
}

export default Divider
