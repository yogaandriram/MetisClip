'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Sparkles, Film, Settings, Video, Layout, ListChecks, HardDrive, Loader2 } from 'lucide-react'
import { Providers } from '@/components/Providers'
import { AgentSwitcher } from '@/components/ui/AgentSwitcher'
import { NavLink } from '@/components/ui/NavLink'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type JobStatus } from '@/lib/engine'
import { ACTIVE_JOB_STATUSES } from '@/lib/format'

const NAV_ITEMS = [
  { name: 'Beranda', href: '/dashboard/', icon: LayoutDashboard },
  { name: 'Cari Video', href: '/discover/', icon: Sparkles },
  { name: 'Antrian', href: '/jobs/', icon: ListChecks },
  { name: 'Hasil Clip', href: '/clips/', icon: Film },
  { name: 'Brand Template', href: '/brand-template/', icon: Layout },
  { name: 'Pengaturan', href: '/settings/', icon: Settings },
  { name: 'Sistem', href: '/system/', icon: HardDrive },
]

function normalize(path: string | null): string {
  if (!path) return '/'
  const p = path.replace(/\/+$/, '')
  return p || '/'
}

/** Number of pending/running jobs across all agents, kept live via engine events. */
function useActiveJobCount(): number {
  const { epoch } = useEngine()
  const [active, setActive] = useState<Record<string, true>>({})

  useEffect(() => {
    let cancelled = false
    api.jobs
      .list({ limit: 100 })
      .then(({ jobs }) => {
        if (cancelled) return
        const next: Record<string, true> = {}
        jobs.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status)).forEach((j) => (next[j.id] = true))
        setActive(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [epoch])

  useEngineEvents((e) => {
    if (e.type !== 'job.progress' && e.type !== 'job.status') return
    const isActive = ACTIVE_JOB_STATUSES.includes(e.status as JobStatus)
    setActive((prev) => {
      if (isActive === !!prev[e.id]) return prev
      const next = { ...prev }
      if (isActive) next[e.id] = true
      else delete next[e.id]
      return next
    })
  })

  return Object.keys(active).length
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = normalize(usePathname())
  const { systemInfo } = useEngine()
  const activeJobs = useActiveJobCount()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-deep)' }}>
      <aside
        style={{
          width: '260px',
          flexShrink: 0,
          borderRight: '1px solid var(--border-glass)',
          background: 'rgba(10, 10, 15, 0.85)',
          padding: '30px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', paddingLeft: '10px' }}>
            <div
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 15px var(--primary-glow)',
              }}
            >
              <Video size={16} color="#fff" />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 800,
                background: 'linear-gradient(90deg, #fff, #8fb0ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              MetisClip
            </span>
          </div>

          <AgentSwitcher />

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {NAV_ITEMS.map((item) => {
              const base = normalize(item.href)
              const isActive = pathname === base || pathname.startsWith(`${base}/`)
              return (
                <NavLink key={item.name} href={item.href} icon={item.icon} isActive={isActive} badgeCount={item.href === '/jobs/' ? activeJobs : undefined} badgeTone="primary">
                  {item.name}
                </NavLink>
              )
            })}
          </nav>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
          {activeJobs > 0 && (
            <Link
              href="/jobs/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(24, 86, 255, 0.1)',
                border: '1px solid var(--border-glass-glow)',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontSize: '13px',
              }}
            >
              <Loader2 size={16} color="var(--primary)" className="animate-spin" />
              <span>
                <strong>{activeJobs}</strong> proses sedang berjalan
              </span>
            </Link>
          )}
          <div style={{ borderTop: '1px solid var(--border-glass)', padding: '14px 10px 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <div>
              MetisClip Desktop {typeof window !== 'undefined' && window.metis ? `v${window.metis.appVersion}` : systemInfo ? `v${systemInfo.version}` : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: systemInfo?.mongo.ok === false ? 'var(--danger)' : 'var(--accent)',
                  display: 'inline-block',
                }}
              />
              {systemInfo?.mongo.ok === false ? 'Database bermasalah' : 'Engine lokal aktif'}
              {systemInfo?.env === 'dev' ? ' · dev' : ''}
            </div>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: '40px', overflowY: 'auto', height: '100vh' }}>{children}</main>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Shell>{children}</Shell>
    </Providers>
  )
}
