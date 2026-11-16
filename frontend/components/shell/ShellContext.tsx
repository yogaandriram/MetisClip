'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type JobStatus } from '@/lib/engine'
import { ACTIVE_JOB_STATUSES } from '@/lib/format'

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

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const activeJobs = useActiveJobCount()
  useSystemNotices()
  return <ShellContext.Provider value={{ activeJobs }}>{children}</ShellContext.Provider>
}

/** null outside the app shell (e.g. the Setup Wizard). */
export function useShell(): ShellContextValue | null {
  return useContext(ShellContext)
}
