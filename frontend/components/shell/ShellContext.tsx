'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type JobStatus } from '@/lib/engine'
import { ACTIVE_JOB_STATUSES, splitPath } from '@/lib/format'
import { tm } from '@/lib/i18n'
import { QUEUE_HREF } from '@/lib/routes'

type ShellContextValue = {
  /** Pending + running jobs across all campaigns, kept live through engine events */
  activeJobs: number
}

const ShellContext = createContext<ShellContextValue | null>(null)

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

/** Engine notices (low disk space, RAM full) as toasts, wherever the user is in the app. */
function useSystemNotices(): void {
  useEngineEvents((e) => {
    if (e.type !== 'system.notice') return
    if (e.level === 'error') toast.error(e.message, { id: e.message })
    else toast(e.message, { id: e.message, duration: e.level === 'warning' ? 8000 : 4000 })
  })
}

/**
 * Windows notifications when a job or an export finishes or fails, wherever the user is in the app;
 * main shows them only while the window is in the background. A click opens the result.
 */
function useDesktopNotifications(): void {
  const router = useRouter()

  useEffect(() => window.metis?.onNavigate?.((route) => router.push(route)), [router])

  useEngineEvents((e) => {
    const metis = window.metis
    if (!metis) return
    const m = tm().shell.notify
    const lines = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join('\n')
    if (e.type === 'job.status' && e.kind === 'recut' && e.clip_id) {
      const route = `/clips/detail/?id=${encodeURIComponent(e.clip_id)}`
      if (e.status === 'completed') metis.notify(m.recutDone, e.title || undefined, { route })
      else if (e.status === 'failed') metis.notify(m.recutFailed, lines(e.title, e.error), { route })
    } else if (e.type === 'job.status') {
      if (e.status === 'completed') {
        const n = e.clips ?? 0
        const campaign = e.campaign_ids?.[0]
        metis.notify(n > 0 ? m.jobDone(n) : m.jobDoneNone, lines(e.title, e.error), {
          route: n > 0 ? `/clips/?${campaign ? `campaign=${campaign}&` : ''}job=${encodeURIComponent(e.id)}` : QUEUE_HREF,
        })
      } else if (e.status === 'failed') {
        metis.notify(m.jobFailed, lines(e.title, e.error), { route: QUEUE_HREF })
      }
    } else if (e.type === 'render.status') {
      const route = `/clips/detail/?id=${encodeURIComponent(e.clip_id)}`
      if (e.status === 'completed') {
        const body = e.exported_path ? m.renderSavedIn(splitPath(e.exported_path)[0]) : e.export_error ? m.renderNotCopied : undefined
        metis.notify(m.renderDone, body, { route })
      } else if (e.status === 'failed') {
        metis.notify(m.renderFailed, e.error || undefined, { route })
      }
    }
  })
}

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const activeJobs = useActiveJobCount()
  useSystemNotices()
  useDesktopNotifications()
  return <ShellContext.Provider value={{ activeJobs }}>{children}</ShellContext.Provider>
}

/** null outside the app shell (e.g. the Setup Wizard). */
export function useShell(): ShellContextValue | null {
  return useContext(ShellContext)
}
