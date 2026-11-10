'use client'

import React, { useState } from 'react'
import { FileVideo, FolderOpen, X } from 'lucide-react'
import { Button, Card, DropZone, Field, IconButton, IconTile } from '@/components/ui'
import { VIDEO_FILE_EXTENSIONS, fileName } from '@/lib/format'

interface VideoFilePickerProps {
  /** Absolute path of the chosen video, or null */
  value: string | null
  onChange: (path: string | null) => void
  onError: (message: string | null) => void
}

const FORMATS = VIDEO_FILE_EXTENSIONS.map((e) => e.toUpperCase()).join(', ')

/** Choose a video on this PC: drag & drop or the Windows file dialog. The file is used in place. */
export function VideoFilePicker({ value, onChange, onError }: VideoFilePickerProps) {
  const [over, setOver] = useState(false)
  const desktop = typeof window !== 'undefined' && !!window.metis

  const accept = (path: string) => {
    const ext = (path.split('.').pop() || '').toLowerCase()
    if (!VIDEO_FILE_EXTENSIONS.includes(ext)) {
      onError(`Format file tidak didukung. Pakai video ${FORMATS}.`)
      return
    }
    onError(null)
    onChange(path)
  }

  const browse = async () => {
    const path = await window.metis?.selectFile({ title: 'Pilih video', filters: [{ name: 'Video', extensions: VIDEO_FILE_EXTENSIONS }] })
    if (path) accept(path)
  }

  const takeDroppedFile = (file: File | undefined) => {
    if (!file) return
    const path = window.metis?.pathForFile(file) || ''
    if (!path) {
      onError('File ini tidak bisa dipakai langsung. Simpan dulu ke komputer, lalu klik area unggah untuk memilihnya.')
      return
    }
    accept(path)
  }

  // The chosen-file row stays a drop target, so another video can be dropped onto it to replace the first.
  const drag = {
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setOver(true)
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setOver(false)
      takeDroppedFile(e.dataTransfer.files[0])
    },
  }

  const folder = value ? value.slice(0, Math.max(0, value.length - fileName(value).length)).replace(/[\\/]$/, '') : ''

  return (
    <Field
      label="Video dari komputer"
      hint="Video dipakai langsung dari lokasinya (tidak disalin), jadi jangan dipindah atau dihapus sampai job selesai. Transkripnya dibuat dengan Whisper, jadi API key Groq wajib diisi di Pengaturan."
    >
      {value ? (
        <Card tone="dew" padding="sm" className={over ? 'mc-row mc-drop--over' : 'mc-row'} {...drag}>
          <IconTile icon={<FileVideo size={18} />} />
          <div className="mc-stack mc-gap-4 mc-grow">
            <span className="mc-label mc-truncate" title={value}>
              {fileName(value)}
            </span>
            <span className="mc-caption mc-mono mc-muted mc-truncate" title={folder}>
              {folder}
            </span>
          </div>
          <Button variant="secondary" size="sm" icon={<FolderOpen size={16} />} onClick={browse} disabled={!desktop}>
            Ganti
          </Button>
          <IconButton variant="outline" size="sm" label="Hapus pilihan file" icon={<X size={16} />} onClick={() => onChange(null)} />
        </Card>
      ) : (
        <DropZone
          title="Seret video ke sini atau klik untuk memilih file"
          overTitle="Lepaskan untuk memakai video ini"
          hint={FORMATS}
          onActivate={browse}
          onFiles={(files) => takeDroppedFile(files[0])}
          disabled={!desktop}
        />
      )}
    </Field>
  )
}

export default VideoFilePicker
