'use client'

import React, { useState } from 'react'
import { Upload } from 'lucide-react'
import { cx } from '@/lib/cx'

interface DropZoneProps {
  title: React.ReactNode
  /** Shown while a file is dragged over */
  overTitle?: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  /** Click / Enter / Space: open the file dialog */
  onActivate: () => void
  onFiles: (files: File[]) => void
  disabled?: boolean
  invalid?: boolean
  className?: string
}

/** Dashed drop target; the whole zone is one button (DESIGN.md §8.15). */
export function DropZone({ title, overTitle, hint, icon, onActivate, onFiles, disabled, invalid, className }: DropZoneProps) {
  const [over, setOver] = useState(false)
  return (
    <button
      type="button"
      disabled={disabled}
      className={cx('mc-drop', over && 'mc-drop--over', invalid && !over && 'mc-drop--invalid', className)}
      onClick={onActivate}
      onDragOver={(e) => {
        e.preventDefault()
        if (disabled) return
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (disabled) return
        const files = Array.from(e.dataTransfer.files)
        if (files.length) onFiles(files)
      }}
    >
      <span className="mc-drop__icon" aria-hidden="true">
        {icon || <Upload size={22} />}
      </span>
      <span className="mc-drop__title">{over && overTitle ? overTitle : title}</span>
      {hint && <span className="mc-drop__hint">{hint}</span>}
    </button>
  )
}

export default DropZone
