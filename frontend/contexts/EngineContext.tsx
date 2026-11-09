'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, Power } from 'lucide-react'
import { api, getEngineInfo, type SystemInfo } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'

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
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <div style={{ width: '260px', padding: '30px 20px', borderRight: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Skeleton height={32} width={140} />
        <Skeleton height={56} style={{ marginBottom: '20px' }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} height={40} />
        ))}
      </div>
      <div style={{ flex: 1, padding: '40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-dim)', fontSize: '14px' }}>
          <Spinner size="sm" color="primary" />
          <span>{message || 'Menghubungkan ke engine MetisClip…'}</span>
        </div>
        <Skeleton height={36} width={320} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <Skeleton height={130} />
          <Skeleton height={130} />
          <Skeleton height={130} />
        </div>
        <Skeleton height={260} />
      </div>
    </div>
  )
}

function EngineErrorScreen({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-deep)', padding: '20px' }}>
      <div className="glass-card-glowing" style={{ maxWidth: '520px', width: '100%', padding: '36px', textAlign: 'center' }}>
        <AlertTriangle size={44} color="var(--danger)" style={{ margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Engine MetisClip tidak dapat dihubungi</h1>
        <p style={{ color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '26px', wordBreak: 'break-word' }}>
          {message || 'Terjadi kesalahan saat menyalakan engine lokal.'}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
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
    </div>
  )
}

function EngineBanner({ phase, message, onRetry }: { phase: Phase; message: string | null; onRetry: () => void }) {
  const isError = phase === 'error'
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        borderRadius: '12px',
        background: 'rgba(7, 7, 15, 0.95)',
        border: `1px solid ${isError ? 'var(--danger)' : 'var(--warning)'}`,
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        fontSize: '13px',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      {isError ? <AlertTriangle size={16} color="var(--danger)" /> : <Spinner size="sm" color="accent" />}
      <span>{message || (isError ? 'Engine berhenti.' : 'Engine sedang dimulai ulang…')}</span>
      {isError && (
        <button className="mc-link-button" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  )
}
