import React from 'react'

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  containerStyle?: React.CSSProperties
}

export const DatePicker: React.FC<DatePickerProps> = ({
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
        <input
          type="date"
          className={`glass-input ${className}`}
          style={{
            padding: '12px 16px',
            borderColor: error ? 'var(--danger)' : 'var(--border-glass)',
            boxShadow: error ? '0 0 10px rgba(234, 33, 67, 0.2)' : 'none',
            color: props.value ? 'var(--text-primary)' : 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
            /* Add custom styling for webkit date picker pseudo elements if needed */
            colorScheme: 'dark', // Native dark mode calendar popout
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

export default DatePicker
