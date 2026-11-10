'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type JobStatus } from '@/lib/engine'
import { ACTIVE_JOB_STATUSES } from '@/lib/format'

type ShellContextValue = {
  /** Pending + running jobs across all agents, kept live through engine events */
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

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const activeJobs = useActiveJobCount()
  return <ShellContext.Provider value={{ activeJobs }}>{children}</ShellContext.Provider>
}

/** null outside the app shell (e.g. the Setup Wizard). */
export function useShell(): ShellContextValue | null {
  return useContext(ShellContext)
}
