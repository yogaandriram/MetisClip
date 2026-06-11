import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

export interface DropdownItem {
  id: string
  label: string
  icon?: React.ElementType
  onClick?: () => void
  href?: string
  danger?: boolean
}

interface DropdownProps {
  trigger: React.ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
  width?: string
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  align = 'left',
  width = '220px'
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: width === '100%' ? 'block' : 'inline-block', width: width === '100%' ? '100%' : 'auto' }}>
      {/* Trigger */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ cursor: 'pointer', display: width === '100%' ? 'block' : 'inline-block', width: width === '100%' ? '100%' : 'auto' }}
      >
        {trigger}
      </div>

      {/* Menu Body */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            [align === 'right' ? 'right' : 'left']: 0,
            width: width,
            background: 'rgba(10, 10, 15, 0.8)', // Darker base for overlay
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
            padding: '8px',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            maxHeight: '300px',
            overflowY: 'auto',
            animation: 'dropdownFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="custom-scrollbar"
        >
          {items.map((item) => {
            const content = (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  color: item.danger ? 'var(--danger)' : 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  background: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = item.danger 
                    ? 'rgba(234, 33, 67, 0.1)' 
                    : 'rgba(255, 255, 255, 0.06)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
                onClick={() => {
                  if (item.onClick) item.onClick()
                  setIsOpen(false)
                }}
              >
                {item.icon && <item.icon size={16} />}
                <span>{item.label}</span>
              </div>
            )

            if (item.href) {
              return (
                <Link key={item.id} href={item.href} style={{ textDecoration: 'none' }}>
                  {content}
                </Link>
              )
            }

            return <React.Fragment key={item.id}>{content}</React.Fragment>
          })}
        </div>
      )}

      {/* Global Style for dropdown animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}} />
    </div>
  )
}

export default Dropdown
