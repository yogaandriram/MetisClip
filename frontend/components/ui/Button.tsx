import React from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  style,
  ...props
}) => {
  // Determine variant-specific style properties override in line with DESIGN.md
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'secondary':
        return {
          background: 'var(--bg-glass)',
          border: '1px solid var(--border-glass)',
          color: 'var(--text-primary)',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)'
        }
      case 'danger':
        return {
          background: 'linear-gradient(135deg, var(--danger), #ab1830)',
          boxShadow: '0 4px 15px rgba(234, 33, 67, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#FFFFFF'
        }
      case 'success':
        return {
          background: 'linear-gradient(135deg, var(--accent), #058f4a)',
          boxShadow: '0 4px 15px var(--accent-glow)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#FFFFFF'
        }
      case 'primary':
      default:
        return {} // Handled completely by CSS class btn-primary
    }
  }

  // Size configurations
  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: '8px 16px', fontSize: '13px', borderRadius: '8px' }
      case 'lg':
        return { padding: '16px 32px', fontSize: '18px', borderRadius: '14px' }
      case 'md':
      default:
        return {} // Standard button dimensions from CSS
    }
  }

  const combinedStyles: React.CSSProperties = {
    ...getVariantStyles(),
    ...getSizeStyles(),
    opacity: disabled || loading ? 0.6 : 1,
    pointerEvents: disabled || loading ? 'none' : 'auto',
    ...style
  }

  // CSS classes
  const btnClass = variant === 'primary' ? 'btn-primary' : 'btn-secondary'
  const classes = `${btnClass} ${className}`

  return (
    <button
      className={classes}
      style={combinedStyles}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={16} className="spin-animation" style={{ animation: 'spin-btn 1s linear infinite' }} />
      ) : (
        icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
      )}
      <span>{children}</span>

      <style>{`
        @keyframes spin-btn {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  )
}

export default Button
