'use client'

import { useEffect, useState } from 'react'

/**
 * The app update status from the Electron main process (desktop/src/main/updater.ts), kept live.
 * null outside Electron (`next dev` in a browser) and until the first answer.
 */
export function useUpdateStatus(): MetisUpdateStatus | null {
  const [status, setStatus] = useState<MetisUpdateStatus | null>(null)

  useEffect(() => {
    const metis = typeof window !== 'undefined' ? window.metis : undefined
    if (!metis?.getUpdateStatus) return
    let alive = true
    metis
      .getUpdateStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => undefined)
    const off = metis.onUpdateStatus((s) => setStatus(s))
    return () => {
      alive = false
      off()
    }
  }, [])

  return status
}
