'use client'

import React, { useState } from 'react'
import { Download, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, IconButton } from '@/components/ui'
import { errorMessage } from '@/lib/format'
import { useT } from '@/lib/i18n/I18nProvider'
import { useUpdateStatus } from '@/lib/updates'

/**
 * A downloaded MetisClip version waits to be installed. It installs by itself when MetisClip closes;
 * "Mulai ulang sekarang" installs at once (main asks first while work runs). Closing the banner hides it
 * for that version until the next start.
 */
export function UpdateBanner() {
  const t = useT()
  const m = t.shell.update
  const status = useUpdateStatus()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status?.phase !== 'ready' || !status.version || dismissed === status.version) return null
  const version = status.version

  const install = async () => {
    setBusy(true)
    try {
      await window.metis!.installUpdate()
    } catch (err) {
      toast.error(errorMessage(err, m.failed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="status" className="mc-notice">
      <Download size={16} aria-hidden="true" className="mc-notice__icon" />
      <span>
        <strong>{m.title(version)}</strong> {m.body}
      </span>
      <Button variant="primary" size="sm" onClick={install} loading={busy}>
        {m.restart}
      </Button>
      <IconButton
        label={m.dismiss}
        icon={<X size={16} aria-hidden="true" />}
        variant="ghost"
        size="sm"
        tooltip="top"
        onClick={() => setDismissed(version)}
      />
    </div>
  )
}
