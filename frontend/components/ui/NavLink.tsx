import React from 'react'
import Link from 'next/link'
import { LucideIcon } from 'lucide-react'

interface NavLinkProps {
  href: string
  icon: LucideIcon
  isActive: boolean
  badgeCount?: number
  children: React.ReactNode
}

export const NavLink: React.FC<NavLinkProps> = ({
  href,
  icon: Icon,
  isActive,
  badgeCount,
  children
}) => {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderRadius: '12px',
        textDecoration: 'none',
        color: isActive ? '#fff' : 'var(--text-dim)',
        background: isActive ? 'var(--bg-glass-active)' : 'transparent',
        border: isActive ? '1px solid var(--border-glass)' : '1px solid transparent',
        fontWeight: isActive ? '600' : '400',
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = 'var(--text-primary)'
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = 'var(--text-dim)'
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Icon size={18} color={isActive ? 'var(--accent)' : 'var(--text-muted)'} style={{ transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }} />
        <span>{children}</span>
      </div>

      {badgeCount !== undefined && badgeCount > 0 && (
        <div style={{
          background: 'var(--danger)',
          color: '#fff',
          fontSize: '11px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '12px',
          boxShadow: '0 0 10px rgba(234, 33, 67, 0.4)'
        }}>
          {badgeCount}
        </div>
      )}
    </Link>
  )
}

export default NavLink
