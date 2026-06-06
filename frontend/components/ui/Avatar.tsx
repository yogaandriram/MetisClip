import React from 'react'

interface AvatarProps {
  src?: string
  alt?: string
  initials?: string
  size?: 'sm' | 'md' | 'lg'
  style?: React.CSSProperties
  className?: string
  onClick?: () => void
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = 'Avatar',
  initials,
  size = 'md',
  style,
  className = '',
  onClick
}) => {
  const getDimensions = () => {
    switch (size) {
      case 'sm': return '32px'
      case 'lg': return '64px'
      case 'md':
      default: return '48px'
    }
  }

  const dim = getDimensions()

  const combinedStyles: React.CSSProperties = {
    width: dim,
    height: dim,
    borderRadius: '50%',
    background: 'var(--bg-glass)',
    border: '1px solid var(--border-glass)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    cursor: onClick ? 'pointer' : 'default',
    flexShrink: 0,
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
    ...style
  }

  return (
    <div 
      className={className} 
      style={combinedStyles}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
          e.currentTarget.style.transform = 'scale(1.05)'
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = 'var(--border-glass)'
          e.currentTarget.style.transform = 'scale(1)'
        }
      }}
    >
      {src ? (
        <img 
          src={src} 
          alt={alt} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      ) : (
        <span style={{ 
          color: 'var(--text-primary)', 
          fontFamily: 'var(--font-display)', 
          fontWeight: 700,
          fontSize: size === 'sm' ? '12px' : size === 'lg' ? '24px' : '18px'
        }}>
          {initials ? initials.substring(0, 2).toUpperCase() : '?'}
        </span>
      )}
    </div>
  )
}

export default Avatar
