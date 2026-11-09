'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Video } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

/**
 * Entry point (app://metisclip/ or http://localhost:3000/).
 * Desktop without a data folder yet -> first-run setup, otherwise the dashboard.
 * In a normal browser (dev) there is no bridge: go straight to the dashboard, which
 * connects to NEXT_PUBLIC_ENGINE_URL.
 */
export default function EntryPage() {
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', background: 'var(--bg-deep)' }}>
      <div
        style={{
          background: 'linear-gradient(135deg, var(--primary), var(--accent))',
          width: '56px',
          height: '56px',
          borderRadius: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 30px var(--primary-glow)',
        }}
      >
        <Video size={26} color="#fff" />
      </div>
      <Spinner size="sm" color="primary" />
      <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Memuat MetisClip…</p>
    </div>
  )
}
