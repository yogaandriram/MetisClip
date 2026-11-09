import React, { useState } from 'react'
import { GlassCard } from '@/components/ui/GlassCard'
import { BrandSettings } from '../types'
import { UploadCloud, FileVideo, Image as ImageIcon, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/engine'
import { assetUrl } from '@/lib/media'
import { errorMessage } from '@/lib/format'

type AssetKey = 'overlayUrl' | 'sampleVideoUrl'

// Upload kind sent to the engine (stored under library/<agent>/_assets/)
const ASSET_KIND: Record<AssetKey, string> = {
  overlayUrl: 'overlay',
  sampleVideoUrl: 'sample_video',
}

interface BrandSettingsPanelProps {
  agentId: string
  brand: BrandSettings
  updateBrand: (updates: Partial<BrandSettings>) => void
}

export const BrandSettingsPanel: React.FC<BrandSettingsPanelProps> = ({ agentId, brand, updateBrand }) => {
  const [uploading, setUploading] = useState<AssetKey | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: AssetKey) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const isVideo = key === 'sampleVideoUrl'
    const maxSize = (isVideo ? 200 : 20) * 1024 * 1024
    if (file.size > maxSize) {
      toast.error(`File terlalu besar. Maksimal ${maxSize / (1024 * 1024)} MB`)
      return
    }

    setUploading(key)
    const toastId = toast.loading('Mengunggah ke folder data…')
    try {
      const { value } = await api.agents.uploadBrandAsset(agentId, file, ASSET_KIND[key])
      updateBrand({ [key]: value } as Partial<BrandSettings>)
      toast.success('Aset tersimpan. Jangan lupa klik Simpan.', { id: toastId })
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengunggah file'), { id: toastId })
    } finally {
      setUploading(null)
    }
  }

  const renderUploader = (title: string, description: string, accept: string, key: AssetKey, Icon: React.ElementType, previewImage = false) => {
    const current = brand[key]
    const busy = uploading === key
    const fileName = current ? decodeURIComponent(current.split('/').pop() || '') : ''

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600 }}>{title}</h4>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{description}</p>

        {current ? (
          <div style={{ padding: '12px', background: 'var(--bg-glass)', borderRadius: '8px', border: '1px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', minWidth: 0 }}>
              {previewImage && assetUrl(current) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(current)} alt="" style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '4px', background: 'rgba(0,0,0,0.3)' }} />
              ) : (
                <Icon size={18} color="var(--primary)" />
              )}
              <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fileName}>
                {fileName || 'Aset dipilih'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateBrand({ [key]: '' } as Partial<BrandSettings>)}
              style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}
            >
              Hapus
            </button>
          </div>
        ) : (
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '26px 20px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '12px',
              border: '1px dashed var(--border-glass)',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? <Loader2 size={26} color="var(--primary)" className="animate-spin" style={{ marginBottom: '10px' }} /> : <UploadCloud size={26} color="var(--text-muted)" style={{ marginBottom: '10px' }} />}
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
              {busy ? 'Mengunggah…' : 'Klik untuk memilih file'}
              <br />
              <small>({accept})</small>
            </span>
            <input type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => handleUpload(e, key)} disabled={!!uploading} />
          </label>
        )}
      </div>
    )
  }

  return (
    <GlassCard padding="20px" style={{ width: '300px', height: '610px', overflowY: 'auto' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Overlay</h3>

      {renderUploader('Watermark / logo', 'Logo PNG transparan yang ditempel di semua clip. Geser & ubah ukurannya di preview.', 'image/png,image/jpeg,image/webp', 'overlayUrl', ImageIcon, true)}

      <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '1px solid var(--border-glass)' }}>
        {renderUploader('Video contoh', 'Video 3–10 detik sebagai latar preview di halaman ini (tidak ikut dirender).', 'video/mp4,video/webm', 'sampleVideoUrl', FileVideo)}
      </div>
    </GlassCard>
  )
}
