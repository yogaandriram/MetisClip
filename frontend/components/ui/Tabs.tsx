import React from 'react'

export interface Tab {
  id: string
  label: string
  icon?: React.ReactNode
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
  style?: React.CSSProperties
  className?: string
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  style,
  className = ''
}) => {
  return (
    <div 
      className={className}
      style={{
        display: 'inline-flex',
        background: 'rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border-glass)',
        borderRadius: '12px',
        padding: '6px',
        gap: '4px',
        ...style
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              background: isActive ? 'var(--bg-glass-active)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              border: isActive ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid transparent',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: isActive ? 600 : 500,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--text-primary)'
                e.currentTarget.style.background = 'var(--bg-glass)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            {tab.icon && <span>{tab.icon}</span>}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export default Tabs
