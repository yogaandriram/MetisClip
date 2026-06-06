import React from 'react'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
  style
}) => {
  return (
    <label 
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style
      }}
    >
      <div 
        style={{
          position: 'relative',
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          background: checked ? 'var(--primary)' : 'var(--bg-glass)',
          border: `1px solid ${checked ? 'var(--primary)' : 'var(--border-glass)'}`,
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: checked ? '0 0 10px var(--primary-glow)' : 'none',
        }}
        onClick={() => !disabled && onChange(!checked)}
      >
        <div 
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '22px' : '2px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: '#FFFFFF',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        />
      </div>
      {label && (
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {label}
        </span>
      )}
    </label>
  )
}

export default ToggleSwitch
