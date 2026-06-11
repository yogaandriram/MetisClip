'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { LogOut, LayoutDashboard, Sparkles, Film, Calendar, Settings, Video, Bot, Layout } from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Providers } from '@/components/Providers'
import { AgentSwitcher } from '@/components/ui/AgentSwitcher'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const supabase = createClientComponentClient()

  const navItems = [
    { name: 'Beranda', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Cari Video', href: '/discover', icon: Sparkles },
    { name: 'Hasil Clip', href: '/clips', icon: Film },
    { name: 'Jadwal Post', href: '/schedule', icon: Calendar },
    { name: 'Brand Template', href: '/brand-template', icon: Layout },
    { name: 'Pengaturan', href: '/settings', icon: Settings },
  ]

  return (
    <Providers>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-deep)' }}>
      {/* Sidebar Navigation */}
      <aside style={{
        width: '260px',
        borderRight: '1px solid var(--border-glass)',
        background: 'rgba(10, 10, 15, 0.6)',
        backdropFilter: 'blur(20px)',
        padding: '30px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        height: '100vh'
      }}>
        <div>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '40px', paddingLeft: '10px' }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px var(--primary-glow)'
            }}>
              <Video size={16} color="#fff" />
            </div>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              fontWeight: 800,
              background: 'linear-gradient(90deg, #fff, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>MetisClip</span>
          </div>

          <AgentSwitcher />

          {/* Nav List */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <a
                  key={item.name}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    color: isActive ? '#fff' : 'var(--text-dim)',
                    background: isActive ? 'var(--bg-glass-active)' : 'transparent',
                    border: isActive ? '1px solid var(--border-glass)' : '1px solid transparent',
                    fontWeight: isActive ? '600' : '400',
                    transition: 'var(--transition-fast)'
                  }}
                >
                  <Icon size={18} color={isActive ? 'var(--accent)' : 'var(--text-muted)'} />
                  <span>{item.name}</span>
                </a>
              )
            })}
          </nav>
        </div>

        {/* User Footer info */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '15px 10px',
            borderTop: '1px solid var(--border-glass)',
            marginBottom: '10px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED, #06D6A0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '14px',
              color: '#fff'
            }}>
              YA
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>Yoga Andrian</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pro Member</span>
            </div>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '12px',
              color: 'var(--danger)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              width: '100%',
              transition: 'var(--transition-fast)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(234, 33, 67, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <LogOut size={16} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Panel Content Container */}
      <main style={{ flex: 1, padding: '40px', overflowY: 'auto', height: '100vh' }}>
        {children}
      </main>
    </div>
    </Providers>
  )
}
