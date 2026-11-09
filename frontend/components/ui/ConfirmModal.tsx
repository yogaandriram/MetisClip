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
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: React.ReactNode
}

/** In-app replacement for window.confirm (blocked/ugly in Electron). */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
  children,
}) => (
  <Modal isOpen={isOpen} onClose={loading ? () => undefined : onClose} title={title}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {message && <div style={{ color: 'var(--text-dim)', lineHeight: 1.6, fontSize: '14px' }}>{message}</div>}
      {children}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  </Modal>
)

export default ConfirmModal
