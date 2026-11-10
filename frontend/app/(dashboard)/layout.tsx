'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { Clapperboard, Film, LayoutGrid, ListChecks, Palette, Settings } from 'lucide-react'
import { Providers } from '@/components/Providers'
import { NavRail, normalizePath, type RailItem } from '@/components/shell/NavRail'
import { ShellProvider, useShell } from '@/components/shell/ShellContext'
import { Logo } from '@/components/ui/Logo'
import { useEngine } from '@/contexts/EngineContext'

const NAV_ITEMS: RailItem[] = [
  { name: 'Beranda', href: '/dashboard/', icon: LayoutGrid },
  { name: 'Cari Video', href: '/discover/', icon: Clapperboard },
  { name: 'Antrian', href: '/jobs/', icon: ListChecks },
  { name: 'Hasil Clip', href: '/clips/', icon: Film },
  { name: 'Brand Template', href: '/brand-template/', icon: Palette },
  { name: 'Pengaturan', href: '/settings/', icon: Settings },
]

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = normalizePath(usePathname())
  const { systemInfo } = useEngine()
  const shell = useShell()
  const activeJobs = shell?.activeJobs ?? 0

  const version = typeof window !== 'undefined' && window.metis ? window.metis.appVersion : systemInfo?.version
  const dbProblem = systemInfo?.mongo.ok === false
  const systemHint = [
    'Sistem',
    dbProblem ? 'Database bermasalah' : 'Engine lokal aktif',
    version ? `v${version}` : null,
    systemInfo?.env === 'dev' ? 'dev' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const items = NAV_ITEMS.map((item) => (item.href === '/jobs/' ? { ...item, count: activeJobs } : item))

  return (
    <div className="mc-shell">
      <div className="mc-shell__logo">
        <Logo href="/dashboard/" />
      </div>
      <div className="mc-shell__rail">
        <NavRail items={items} pathname={pathname} systemHint={systemHint} systemProblem={dbProblem} />
      </div>
      <main className="mc-shell__main">
        <div className="mc-shell__content">{children}</div>
      </main>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <ShellProvider>
        <Shell>{children}</Shell>
      </ShellProvider>
    </Providers>
  )
}
