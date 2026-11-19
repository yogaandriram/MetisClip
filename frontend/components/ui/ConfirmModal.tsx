'use client'

import React from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { useT } from '@/lib/i18n/I18nProvider'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive: the confirm button becomes solid ink and should name the action ("Hapus klip") */
  danger?: boolean
  confirmIcon?: React.ReactNode
  loading?: boolean
  /** The action can't run now (the body says why) */
  confirmDisabled?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: React.ReactNode
}

/** In-app replacement for window.confirm (blocked in Electron). */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  confirmIcon,
  loading = false,
  confirmDisabled = false,
  onConfirm,
  onClose,
  children,
}: ConfirmModalProps) {
  const t = useT()
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      busy={loading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel ?? t.common.cancel}
          </Button>
          <Button variant="primary" icon={confirmIcon} onClick={onConfirm} loading={loading} disabled={confirmDisabled} data-autofocus={danger ? undefined : true}>
            {confirmLabel ?? t.ui.confirm}
          </Button>
        </>
      }
    >
      {/* Long paths and file names wrap instead of running past the panel */}
      <div className="mc-stack" style={{ overflowWrap: 'anywhere' }}>
        {message &&<div className="mc-muted">{message}</div>}
        {children}
      </div>
    </Modal>
  )
}

export default ConfirmModal
