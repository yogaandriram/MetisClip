import React from 'react'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: 'primary' | 'accent' | 'white'
  style?: React.CSSProperties
  className?: string
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  color = 'primary',
  style,
  className = ''
}) => {
  const getDimensions = () => {
    switch (size) {
      case 'sm': return { width: '20px', height: '20px', borderSize: '2px' }
      case 'lg': return { width: '60px', height: '60px', borderSize: '4px' }
      case 'md':
      default:
        return { width: '40px', height: '40px', borderSize: '3px' }
    }
  }

  const getColorHex = () => {
    switch (color) {
      case 'accent': return 'var(--accent)'
      case 'white': return '#FFFFFF'
      case 'primary':
      default:
        return 'var(--primary)'
    }
  }

  const dims = getDimensions()
  const colorHex = getColorHex()

  const combinedStyles: React.CSSProperties = {
    width: dims.width,
    height: dims.height,
    borderRadius: '50%',
    border: `${dims.borderSize} solid var(--border-glass)`,
    borderTopColor: colorHex,
    animation: 'spin 1s linear infinite',
    ...style
  }

  return (
    <div className={className} style={combinedStyles}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default Spinner
