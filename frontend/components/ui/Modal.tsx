'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from '@/lib/cx'
import { IconButton } from './IconButton'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Buttons, right-aligned: secondary or ghost first, then primary or danger */
  footer?: React.ReactNode
  /** Escape and the close button do nothing while true (e.g. a request is in flight) */
  busy?: boolean
  children: React.ReactNode
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Dialog with focus trap, Escape to close and focus return (DESIGN.md §8.12). */
export function Modal({ isOpen, onClose, title, size = 'sm', footer, busy = false, children }: ModalProps) {
  const [mounted, setMounted] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') || panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!items.length) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
    // onClose is intentionally not a dependency: re-running would steal focus on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, busy])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="mc-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cx('mc-modal', size !== 'sm' && `mc-modal--${size}`)}
      >
        <div className="mc-modal__head">
          {title ? (
            <h2 id={titleId} className="mc-modal__title">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <IconButton label="Tutup" icon={<X size={18} />} variant="ghost" size="sm" tooltip="end" onClick={onClose} disabled={busy} />
        </div>
        {children}
        {footer && <div className="mc-modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
