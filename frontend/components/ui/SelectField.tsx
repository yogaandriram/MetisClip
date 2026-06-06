import React from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: SelectOption[]
  containerStyle?: React.CSSProperties
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  options,
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
        <select
          className={`glass-input ${className}`}
          style={{
            appearance: 'none',
            cursor: 'pointer',
            paddingRight: '40px',
            ...style
          }}
          {...props}
        >
          {options.map((opt) => (
            <option 
              key={opt.value} 
              value={opt.value}
              style={{ background: '#07070F', color: '#FFF' }}
            >
              {opt.label}
            </option>
          ))}
        </select>
        {/* Dropdown Chevron Indicator Overlay */}
        <div style={{
          position: 'absolute',
          right: '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center'
        }}>
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
    </div>
  )
}

export default SelectField
