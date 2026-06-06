import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: React.ReactNode
  error?: string
  containerStyle?: React.CSSProperties
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  icon,
  error,
  containerStyle,
  style,
  className = '',
  type,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false)
  const isPasswordType = type === 'password'
  const currentType = isPasswordType ? (showPassword ? 'text' : 'password') : type

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', ...containerStyle }}>
      {label && (
        <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dim)' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', width: '100%' }}>
        {icon && (
          <div style={{
            position: 'absolute',
            left: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}>
            {icon}
          </div>
        )}
        <input
          type={currentType}
          className={`glass-input ${className}`}
          style={{
            paddingLeft: icon ? '45px' : '18px',
            paddingRight: isPasswordType ? '45px' : '18px',
            borderColor: error ? 'var(--danger)' : 'var(--border-glass)',
            boxShadow: error ? '0 0 10px rgba(239, 68, 68, 0.2)' : 'none',
            ...style
          }}
          {...props}
        />
        {isPasswordType && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0
            }}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && (
        <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 500, marginTop: '2px' }}>
          {error}
        </span>
      )}
    </div>
  )
}

export default InputField
