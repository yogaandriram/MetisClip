import React, { useRef, useState } from 'react'
import { FileVideo, Image as ImageIcon, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Card, Divider, IconTile, Spinner } from '@/components/ui'
import { cx } from '@/lib/cx'
import { api } from '@/lib/engine'
import { assetUrl } from '@/lib/media'
import { errorMessage } from '@/lib/format'
import { BrandSettings } from '../types'

type AssetKey = 'overlayUrl' | 'sampleVideoUrl'

// kind: upload kind sent to the engine (stored under library/_brand/<template>/)
const ASSETS: Record<AssetKey, { kind: string; accept: string; formats: string; maxMb: number }> = {
  overlayUrl: { kind: 'overlay', accept: 'image/png,image/jpeg,image/webp', formats: 'PNG, JPG, WEBP · maks. 20 MB', maxMb: 20 },
  sampleVideoUrl: { kind: 'sample_video', accept: 'video/mp4,video/webm', formats: 'MP4, WEBM · maks. 200 MB', maxMb: 200 },
}

interface BrandSettingsPanelProps {
  templateId: string
  brand: BrandSettings
  updateBrand: (updates: Partial<BrandSettings>) => void
}

interface UploaderProps {
  title: string
  description: string
  accept: string
  /** Formats and size limit for people, e.g. "PNG, JPG, WEBP · maks. 20 MB" */
  formats: string
  current?: string
  previewImage?: boolean
  busy: boolean
  disabled: boolean
  onFile: (file: File) => void
  onClear: () => void
}

/** One asset slot: the chosen file with "Hapus", or a compact drop target that opens the file dialog. */
function AssetUploader({ title, description, accept, formats, current, previewImage, busy, disabled, onFile, onClear }: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const fileName = current ? decodeURIComponent(current.split('/').pop() || '') : ''
  const isVideo = accept.startsWith('video/')
  const preview = previewImage ? assetUrl(current) : ''

  return (
    <div className="mc-stack mc-gap-12">
      <div>
        <p className="mc-label">{title}</p>
        <p className="mc-caption mc-muted" style={{ marginTop: 2 }}>
          {description}
        </p>
      </div>

      {current ? (
        <Card tone="dew" padding="none">
          <div className="mc-row" style={{ padding: '8px 8px 8px 12px' }}>
            {preview ? (
              <span className="mc-thumb" style={{ width: 40, height: 40, flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="" style={{ objectFit: 'contain' }} />
              </span>
            ) : (
              <IconTile icon={isVideo ? <FileVideo size={18} /> : <ImageIcon size={18} />} size="sm" />
            )}
            <span className="mc-grow mc-truncate" title={fileName}>
              {fileName || 'Aset dipilih'}
            </span>
            <Button variant="secondary" size="sm" onClick={onClear}>
              Hapus
            </Button>
          </div>
        </Card>
      ) : (
        <button
          type="button"
          className={cx('mc-drop', over && 'mc-drop--over')}
          style={{ minHeight: 132, padding: 'var(--s-5)' }}
          disabled={disabled}
          aria-busy={busy || undefined}
          onClick={() => inputRef.current?.click()}
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
            const file = e.dataTransfer.files?.[0]
            if (!disabled && file) onFile(file)
          }}
        >
          <span className="mc-drop__icon" aria-hidden="true">
            {busy ? <Spinner /> : <Upload size={20} />}
          </span>
          <span className="mc-drop__title">{busy ? 'Mengunggah…' : 'Klik untuk memilih file'}</span>
          <span className="mc-drop__hint">{formats}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
    </div>
  )
}

export const BrandSettingsPanel: React.FC<BrandSettingsPanelProps> = ({ templateId, brand, updateBrand }) => {
  const [uploading, setUploading] = useState<AssetKey | null>(null)

  const handleUpload = async (file: File, key: AssetKey) => {
    const { kind, accept, maxMb } = ASSETS[key]
    if (file.type && !accept.split(',').includes(file.type)) {
      toast.error('Format file tidak didukung')
      return
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`File terlalu besar. Maksimal ${maxMb} MB`)
      return
    }

    setUploading(key)
    const toastId = toast.loading('Mengunggah ke folder data…')
    try {
      const { value } = await api.brandTemplates.uploadAsset(templateId, file, kind)
      updateBrand({ [key]: value } as Partial<BrandSettings>)
      toast.success('Aset tersimpan. Jangan lupa klik Simpan.', { id: toastId })
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengunggah file'), { id: toastId })
    } finally {
      setUploading(null)
    }
  }

  const renderUploader = (title: string, description: string, key: AssetKey, previewImage = false) => (
    <AssetUploader
      title={title}
      description={description}
      accept={ASSETS[key].accept}
      formats={ASSETS[key].formats}
      current={brand[key]}
      previewImage={previewImage}
      busy={uploading === key}
      disabled={!!uploading}
      onFile={(file) => handleUpload(file, key)}
      onClear={() => updateBrand({ [key]: '' } as Partial<BrandSettings>)}
    />
  )

  return (
    <div className="mc-stack mc-gap-24">
      {renderUploader('Watermark / logo', 'Logo PNG transparan yang ditempel di semua clip. Geser & ubah ukurannya di preview.', 'overlayUrl', true)}
      <Divider />
      {renderUploader('Video contoh', 'Video 3–10 detik sebagai latar preview di halaman ini (tidak ikut dirender).', 'sampleVideoUrl')}
    </div>
  )
}
