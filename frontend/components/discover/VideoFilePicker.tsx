'use client'

import React, { useState } from 'react'
import { FileVideo, FolderOpen, UploadCloud, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
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

  const drag = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setOver(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setOver(false)
      const file = e.dataTransfer.files[0]
      if (!file) return
      const path = window.metis?.pathForFile(file) || ''
      if (!path) {
        onError('File ini tidak bisa dipakai langsung. Simpan dulu ke komputer, lalu pilih lewat tombol "Pilih file".')
        return
      }
      accept(path)
    },
  }

  const border = over ? 'var(--primary)' : 'var(--border-glass)'
  const folder = value ? value.slice(0, Math.max(0, value.length - fileName(value).length)).replace(/[\\/]$/, '') : ''

  return (
    <div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '10px' }}>Video dari komputer</div>
      {value ? (
        <div
          {...drag}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '16px 18px',
            borderRadius: '14px',
            border: `1px solid ${border}`,
            background: over ? 'rgba(24, 86, 255, 0.10)' : 'rgba(255,255,255,0.03)',
          }}
        >
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(24, 86, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileVideo size={22} color="var(--primary)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
              {fileName(value)}
            </div>
            <div className="mc-mono" style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={folder}>
              {folder}
            </div>
          </div>
          <Button type="button" variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={browse}>
            Ganti
          </Button>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Hapus pilihan file"
            title="Hapus pilihan file"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <div
          {...drag}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            padding: '34px 20px',
            borderRadius: '14px',
            border: `2px dashed ${border}`,
            background: over ? 'rgba(24, 86, 255, 0.10)' : 'rgba(0,0,0,0.18)',
            textAlign: 'center',
            transition: 'background 0.2s, border-color 0.2s',
          }}
        >
          <UploadCloud size={34} color={over ? 'var(--primary)' : 'var(--text-muted)'} />
          <div style={{ fontSize: '15px', fontWeight: 600 }}>{over ? 'Lepaskan untuk memakai video ini' : 'Tarik & lepas video ke sini'}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{FORMATS}</div>
          <Button type="button" variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={browse} disabled={!desktop} style={{ marginTop: '6px' }}>
            Pilih file
          </Button>
        </div>
      )}
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
        Video dipakai langsung dari lokasinya (tidak disalin), jadi jangan dipindah atau dihapus sampai job selesai. Transkripnya dibuat dengan Whisper, jadi API key Groq wajib diisi di Pengaturan.
      </p>
    </div>
  )
}

export default VideoFilePicker
