'use client'

import React, { useEffect, useState } from 'react'
import { WifiOff, X } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { useT } from '@/lib/i18n/I18nProvider'

/**
 * Shown while the PC has no network (§9.3). Editing and exporting existing clips keep working, because
 * the engine runs on this PC; YouTube downloads and AI calls do not. Closing it hides it until the
 * network drops again.
 */
export function OfflineBanner() {
  const t = useT()
  const [offline, setOffline] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const update = () => {
      const off = !navigator.onLine
      setOffline(off)
      if (!off) setDismissed(false)
    }
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!offline || dismissed) return null
  return (
    <div role="status" className="mc-offline">
      <WifiOff size={16} aria-hidden="true" className="mc-offline__icon" />
      <span>
        <strong>{t.shell.offline.title}</strong> {t.shell.offline.body}
      </span>
      <IconButton
        label={t.shell.offline.dismiss}
        icon={<X size={16} aria-hidden="true" />}
        variant="ghost"
        size="sm"
        tooltip="top"
        onClick={() => setDismissed(true)}
      />
    </div>
  )
}
