import React from 'react'

interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  containerStyle?: React.CSSProperties
}

export const TextAreaField: React.FC<TextAreaFieldProps> = ({
  label,
  error,
  containerStyle,
  style,
  className = '',
  ...props
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', ...containerStyle }}>
      {label && (
        <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dim)' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', width: '100%' }}>
        <textarea
          className={`glass-input ${className}`}
          style={{
            minHeight: '100px',
            resize: 'vertical',
            borderColor: error ? 'var(--danger)' : 'var(--border-glass)',
            boxShadow: error ? '0 0 10px rgba(234, 33, 67, 0.2)' : 'none',
            fontFamily: 'var(--font-sans)',
            ...style
          }}
          {...props}
        />
      </div>
      {error && (
        <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 500, marginTop: '2px' }}>
          {error}
        </span>
      )}
    </div>
  )
}

export default TextAreaField
