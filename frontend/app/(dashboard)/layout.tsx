'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { Clapperboard, Film, LayoutGrid, Palette, Settings } from 'lucide-react'
import { Providers } from '@/components/Providers'
import { CampaignProfile } from '@/components/shell/CampaignProfile'
import { NavRail, normalizePath, type RailItem } from '@/components/shell/NavRail'
import { OfflineBanner } from '@/components/shell/OfflineBanner'
import { UpdateBanner } from '@/components/shell/UpdateBanner'
import { ShellProvider, useShell } from '@/components/shell/ShellContext'
import { useEngine } from '@/contexts/EngineContext'
import { useT } from '@/lib/i18n/I18nProvider'
import type { Messages } from '@/lib/i18n'

// Campaigns are not a rail item: the active campaign is the profile circle above the rail
const NAV_ITEMS: (Omit<RailItem, 'name'> & { key: keyof Messages['shell']['nav'] })[] = [
  { key: 'dashboard', href: '/dashboard/', icon: LayoutGrid },
  { key: 'discover', href: '/discover/', icon: Clapperboard },
  // Hasil Clip holds the job queue too (its Antrian tab), so it carries the running-job count
  { key: 'clips', href: '/clips/', icon: Film },
  { key: 'brand', href: '/brand-template/', icon: Palette },
  { key: 'settings', href: '/settings/', icon: Settings },
]

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = normalizePath(usePathname())
  const { systemInfo } = useEngine()
  const shell = useShell()
  const t = useT()
  const activeJobs = shell?.activeJobs ?? 0

  const version = typeof window !== 'undefined' && window.metis ? window.metis.appVersion : systemInfo?.version
  const dbProblem = systemInfo?.mongo.ok === false
  const systemHint = [
    t.shell.nav.system,
    dbProblem ? t.shell.systemHint.dbProblem : t.shell.systemHint.engineActive,
    version ? `v${version}` : null,
    systemInfo?.env === 'dev' ? 'dev' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const items: RailItem[] = NAV_ITEMS.map(({ key, ...item }) => {
    const name = t.shell.nav[key] as string
    return key === 'clips' ? { ...item, name, count: activeJobs } : { ...item, name }
  })

  return (
    <div className="mc-shell">
      <div className="mc-shell__logo">
        <CampaignProfile pathname={pathname} />
      </div>
      <div className="mc-shell__rail">
        <NavRail items={items} pathname={pathname} systemHint={systemHint} systemProblem={dbProblem} />
      </div>
      <main className="mc-shell__main">
        <div className="mc-shell__content">{children}</div>
      </main>
      <div className="mc-notices">
        <UpdateBanner />
        <OfflineBanner />
      </div>
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
