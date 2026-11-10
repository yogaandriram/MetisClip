'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, Power } from 'lucide-react'
import { api, getEngineInfo, type SystemInfo } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { Button, Card, Logo, Skeleton, Spinner } from '@/components/ui'

type EngineContextValue = {
  /** Increments every time the engine (re)connects; use as an effect dependency to refetch */
  epoch: number
  systemInfo: SystemInfo | null
  refreshSystemInfo: () => Promise<void>
}

const EngineContext = createContext<EngineContextValue | undefined>(undefined)

type Phase = 'connecting' | 'ready' | 'error'

/**
 * Waits for the local engine before rendering children (skeleton while starting,
 * Indonesian error state with "Coba lagi"). Once ready, children stay mounted during an
 * engine restart and a banner is shown instead, so unsaved edits are not lost.
 */
export function EngineGate({ children, requireDataRoot = true }: { children: React.ReactNode; requireDataRoot?: boolean }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('connecting')
  const [message, setMessage] = useState<string | null>(null)
  const [hasBeenReady, setHasBeenReady] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [attempt, setAttempt] = useState(0)
  const phaseRef = useRef<Phase>('connecting')

  const updatePhase = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }

  const refreshSystemInfo = useCallback(async () => {
    try {
      setSystemInfo(await api.system.info())
    } catch {
      /* keep the previous value */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Per-effect-run guard (a ref would leak across React strict-mode double effects)
    let inFlight = false

    const connect = async () => {
      if (inFlight) return
      inFlight = true
      updatePhase('connecting')
      try {
        if (requireDataRoot && window.metis) {
          const root = await window.metis.getDataRoot()
          if (root === null) {
            router.replace('/setup/')
            return
          }
        }
        await getEngineInfo()
        const info = await api.system.info()
        if (cancelled) return
        setSystemInfo(info)
        setMessage(null)
        setHasBeenReady(true)
        setEpoch((e) => e + 1)
        updatePhase('ready')
      } catch (err) {
        if (cancelled) return
        setMessage(
          window.metis
            ? errorMessage(err, 'Engine MetisClip gagal dijalankan.')
            : `${errorMessage(err)}. Pastikan engine berjalan di ${process.env.NEXT_PUBLIC_ENGINE_URL || 'http://127.0.0.1:8000'} (lihat frontend/.env.example).`
        )
        updatePhase('error')
      } finally {
        inFlight = false
      }
    }

    connect()

    let unsubscribe: (() => void) | undefined
    if (window.metis) {
      unsubscribe = window.metis.onEngineStatus((status) => {
        if (cancelled) return
        if (status.state === 'ready') {
          if (phaseRef.current !== 'ready') connect()
        } else if (status.state === 'starting' || status.state === 'restarting') {
          setMessage(status.message || null)
          updatePhase('connecting')
        } else if (status.state === 'error' || status.state === 'stopped') {
          setMessage(status.message || 'Engine MetisClip berhenti.')
          updatePhase('error')
        }
      })
    }

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [attempt, requireDataRoot, router])

  const retry = () => setAttempt((a) => a + 1)

  const value: EngineContextValue = { epoch, systemInfo, refreshSystemInfo }

  if (!hasBeenReady) {
    return phase === 'error' ? <EngineErrorScreen message={message} onRetry={retry} /> : <EngineSkeleton message={message} />
  }

  return (
    <EngineContext.Provider value={value}>
      {children}
      {phase !== 'ready' && <EngineBanner phase={phase} message={message} onRetry={retry} />}
    </EngineContext.Provider>
  )
}

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext)
  if (!ctx) throw new Error('useEngine must be used inside <EngineGate>')
  return ctx
}

function EngineSkeleton({ message }: { message: string | null }) {
  return (
    <div className="mc-shell" aria-busy="true">
      <div className="mc-shell__logo">
        <Logo />
      </div>
      <div className="mc-shell__rail">
        <Skeleton width={64} height="100%" radius="full" />
      </div>
      <main className="mc-shell__main">
        <div className="mc-topbar">
          <div className="mc-stack mc-gap-8">
            <Skeleton width={280} height={32} radius="full" />
            <div className="mc-row mc-muted">
              <Spinner size="sm" />
              <span role="status">{message || 'Menghubungkan ke engine MetisClip…'}</span>
            </div>
          </div>
          <Skeleton width={320} height={48} radius="full" />
        </div>
        <div className="mc-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="mc-col-3" height={200} radius="lg" />
          ))}
          <Skeleton className="mc-col-8" height={280} radius="lg" />
          <Skeleton className="mc-col-4" height={280} radius="lg" />
        </div>
      </main>
    </div>
  )
}

function EngineErrorScreen({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card padding="lg" style={{ maxWidth: 560, width: '100%', borderRadius: 'var(--r-xl)' }}>
        <div className="mc-stack mc-gap-20">
          <Logo size="sm" />
          <div className="mc-stack mc-gap-8">
            <h1 className="mc-h2">Engine MetisClip tidak dapat dihubungi</h1>
            <p className="mc-muted" style={{ overflowWrap: 'anywhere' }}>
              {message || 'Terjadi kesalahan saat menyalakan engine lokal.'}
            </p>
          </div>
          <div className="mc-row mc-row--wrap">
            <Button variant="primary" onClick={onRetry} icon={<RefreshCw size={16} />}>
              Coba lagi
            </Button>
            {typeof window !== 'undefined' && window.metis && (
              <Button variant="secondary" onClick={() => window.metis?.relaunch()} icon={<Power size={16} />}>
                Mulai ulang aplikasi
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

function EngineBanner({ phase, message, onRetry }: { phase: Phase; message: string | null; onRetry: () => void }) {
  const isError = phase === 'error'
  return (
    <div
      role="status"
      className="mc-on-ink"
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        maxWidth: 'calc(100vw - 32px)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 10px 10px 16px',
        borderRadius: 'var(--r-full)',
        background: 'var(--ink)',
        color: 'var(--on-ink)',
        boxShadow: 'var(--shadow-1)',
      }}
    >
      {isError ? <AlertTriangle size={16} aria-hidden="true" /> : <Spinner size="sm" />}
      <span>{message || (isError ? 'Engine berhenti.' : 'Engine sedang dimulai ulang…')}</span>
      {isError && (
        <Button variant="primary" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  )
}
