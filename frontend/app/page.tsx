'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Logo, Spinner } from '@/components/ui'
import { useT } from '@/lib/i18n/I18nProvider'

/**
 * Entry point (app://metisclip/ or http://localhost:3000/).
 * Desktop without a data folder yet -> first-run setup, otherwise the dashboard.
 * In a normal browser (dev) there is no bridge: go straight to the dashboard, which
 * connects to NEXT_PUBLIC_ENGINE_URL.
 */
export default function EntryPage() {
  const t = useT()
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const go = async () => {
      let target = '/dashboard/'
      try {
        if (window.metis) {
          const root = await window.metis.getDataRoot()
          if (root === null) target = '/setup/'
        }
      } catch {
        /* fall through to the dashboard, whose gate shows the error */
      }
      if (!cancelled) router.replace(target)
    }
    go()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="mc-stack mc-gap-24" style={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <Logo />
      <div className="mc-row" role="status">
        <Spinner size="sm" />
        <p className="mc-muted">{t.shell.loadingApp}</p>
      </div>
    </div>
  )
}
