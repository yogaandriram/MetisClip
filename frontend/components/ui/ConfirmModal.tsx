'use client'

import React from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

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
  onConfirm: () => void
  onClose: () => void
  children?: React.ReactNode
}

/** In-app replacement for window.confirm (blocked in Electron). */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  danger = false,
  confirmIcon,
  loading = false,
  onConfirm,
  onClose,
  children,
}: ConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      busy={loading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant="primary" icon={confirmIcon} onClick={onConfirm} loading={loading} data-autofocus={danger ? undefined : true}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="mc-stack">
        {message && <div className="mc-muted">{message}</div>}
        {children}
      </div>
    </Modal>
  )
}

export default ConfirmModal
