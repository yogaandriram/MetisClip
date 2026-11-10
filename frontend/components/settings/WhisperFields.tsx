'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Download, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Badge, Button, Card, ChoiceChips, ConfirmModal, Divider, Field, InputField, ProgressBar, SelectField, Skeleton } from '@/components/ui'
import { SecretField } from '@/components/settings/SecretField'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Settings, type WhisperModelId, type WhisperModelInfo, type WhisperProvider, type WhisperStatus } from '@/lib/engine'
import { errorMessage, formatBytes } from '@/lib/format'

type WhisperSettings = Settings['whisper']

const PROVIDER_OPTIONS: { value: WhisperProvider; label: string }[] = [
  { value: 'auto', label: 'Otomatis' },
  { value: 'local', label: 'Selalu lokal' },
  { value: 'groq', label: 'Selalu Groq' },
]

const MODEL_LABEL: Record<WhisperModelId, string> = { small: 'Small', 'large-v3-turbo': 'Large v3 Turbo' }

function providerHint(provider: WhisperProvider, groqKey: boolean, localOk: boolean): string {
  if (provider === 'groq') return 'Selalu lewat Groq (online). Tanpa API key atau tanpa internet, transkripsi gagal.'
  if (provider === 'local') return 'Selalu di komputer ini. Tidak butuh internet setelah model terunduh, tetapi lebih lambat dan memakai CPU.'
  if (!localOk) return 'Whisper lokal tidak tersedia di instalasi ini, jadi mode Otomatis hanya memakai Groq.'
  return groqKey
    ? 'Memakai Groq selama online. Saat offline, kuota Groq habis, atau Groq gagal, transkripsi pindah ke Whisper lokal sehingga job tetap jalan.'
    : 'API key Groq belum diisi, jadi transkripsi memakai Whisper lokal di komputer ini. Isi key Groq di bawah agar lebih cepat saat online.'
}

interface WhisperSectionProps {
  value: WhisperSettings
  onChange: (value: WhisperSettings) => void
  groqConfigured: boolean
  groqValue: string
  onGroqValue: (value: string) => void
  onGroqConfigured: (configured: boolean) => void
}

/** Pengaturan → Transkripsi: engine choice, local models (download / delete) and the Groq key. */
export function WhisperSection({ value, onChange, groqConfigured, groqValue, onGroqValue, onGroqConfigured }: WhisperSectionProps) {
  const [status, setStatus] = useState<WhisperStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<WhisperModelInfo | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.whisper.status())
      setStatusError(null)
    } catch (err) {
      setStatusError(errorMessage(err, 'Status Whisper lokal tidak dapat dimuat'))
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEngineEvents((e) => {
    if (e.type !== 'whisper.download') return
    if (e.status === 'downloading') {
      setStatus((s) =>
        s
          ? { ...s, models: s.models.map((m) => (m.id === e.id ? { ...m, download: { status: 'downloading', progress: e.progress, error: null } } : m)) }
          : s,
      )
      return
    }
    if (e.status === 'completed') toast.success(`Model ${MODEL_LABEL[e.id]} siap dipakai`)
    if (e.status === 'failed') toast.error(e.message || 'Unduhan model gagal')
    loadStatus()
  })

  const download = async (id: WhisperModelId) => {
    try {
      await api.whisper.download(id)
      setStatus((s) =>
        s ? { ...s, models: s.models.map((m) => (m.id === id ? { ...m, download: { status: 'downloading', progress: 0, error: null } } : m)) } : s,
      )
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const cancel = async (id: WhisperModelId) => {
    try {
      await api.whisper.cancelDownload(id)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const remove = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await api.whisper.remove(toDelete.id)
      toast.success(`Model ${toDelete.label} dihapus`)
      setToDelete(null)
      loadStatus()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const localOk = status?.local.available ?? true
  const effective = status
    ? value.local_model === 'auto'
      ? status.local.auto_models
      : { transcript: value.local_model, subtitle: value.local_model }
    : null
  const usedFor = (id: WhisperModelId) => {
    if (!effective || value.provider === 'groq') return null
    const uses = [effective.transcript === id && 'transkrip video', effective.subtitle === id && 'subtitle klip'].filter(Boolean)
    return uses.length ? `Dipakai untuk ${uses.join(' dan ')}` : null
  }

  const autoHint = status
    ? `Otomatis di PC ini (${status.cpu_cores} inti, ${status.ram_gb.toLocaleString('id-ID')} GB RAM): transkrip video panjang memakai ${MODEL_LABEL[status.local.auto_models.transcript]}, subtitle klip memakai ${MODEL_LABEL[status.local.auto_models.subtitle]}.`
    : undefined

  return (
    <div className="mc-stack mc-gap-20">
      <Field label="Mesin transkripsi" hint={providerHint(value.provider, groqConfigured, localOk)}>
        <ChoiceChips ariaLabel="Mesin transkripsi" options={PROVIDER_OPTIONS} value={value.provider} onChange={(provider) => onChange({ ...value, provider })} />
      </Field>

      <Divider />

      <div className="mc-stack mc-gap-12">
        <h3 className="mc-h3">Whisper lokal</h3>
        {statusError && (
          <Alert
            tone="error"
            action={
              <Button variant="secondary" size="sm" onClick={loadStatus}>
                Coba lagi
              </Button>
            }
          >
            {statusError}
          </Alert>
        )}
        {!status && !statusError ? (
          <Skeleton height={120} radius="md" />
        ) : status && !status.local.available ? (
          <Alert tone="warning" title="Whisper lokal tidak ditemukan">
            File whisper-cli tidak ada di folder aplikasi. Pasang ulang MetisClip untuk memakai transkripsi lokal.
          </Alert>
        ) : status ? (
          <>
            <SelectField
              label="Model lokal"
              hint={value.local_model === 'auto' ? autoHint : 'Model ini dipakai untuk transkrip video dan subtitle klip.'}
              value={value.local_model}
              options={[
                { value: 'auto', label: 'Otomatis (disarankan)' },
                { value: 'small', label: 'Small: cepat' },
                { value: 'large-v3-turbo', label: 'Large v3 Turbo: lebih akurat, lebih lambat' },
              ]}
              onChange={(e) => onChange({ ...value, local_model: e.target.value as WhisperSettings['local_model'] })}
            />
            <div className="mc-stack mc-gap-8">
              {status.models.map((m) => {
                const dl = m.download
                const downloading = dl?.status === 'downloading'
                const use = usedFor(m.id)
                return (
                  <Card key={m.id} tone="dew" padding="sm" className="mc-stack mc-gap-8">
                    <div className="mc-row mc-row--wrap mc-gap-12">
                      <div className="mc-stack mc-gap-4 mc-grow" style={{ minWidth: 220 }}>
                        <div className="mc-row mc-row--wrap mc-gap-8">
                          <span className="mc-label">{m.label}</span>
                          <span className="mc-mono mc-caption">{formatBytes(m.size_bytes)}</span>
                          {m.installed ? (
                            <Badge tone="success" size="sm">
                              Terpasang
                            </Badge>
                          ) : downloading ? (
                            <Badge tone="ink" size="sm">
                              Mengunduh
                            </Badge>
                          ) : (
                            <Badge tone="neutral" size="sm" icon={<Download size={14} aria-hidden="true" />}>
                              Belum diunduh
                            </Badge>
                          )}
                        </div>
                        <span className="mc-caption mc-muted">{m.description}</span>
                        {use && <span className="mc-caption">{use}</span>}
                      </div>
                      <div className="mc-row mc-gap-8">
                        {m.installed ? (
                          <Button variant="ghost" size="sm" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setToDelete(m)}>
                            Hapus
                          </Button>
                        ) : downloading ? (
                          <Button variant="ghost" size="sm" icon={<X size={16} aria-hidden="true" />} onClick={() => cancel(m.id)}>
                            Batalkan
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" icon={<Download size={16} aria-hidden="true" />} onClick={() => download(m.id)}>
                            Unduh
                          </Button>
                        )}
                      </div>
                    </div>
                    {downloading && <ProgressBar value={dl.progress} label={`Unduhan model ${m.label}`} showValue />}
                    {dl?.status === 'failed' && dl.error && <span className="mc-caption">{dl.error}</span>}
                  </Card>
                )
              })}
            </div>
            <p className="mc-caption mc-muted">
              Model yang belum diunduh akan diunduh otomatis saat pertama dipakai (sekali saja, butuh internet). Whisper lokal memakai {status.local.threads} thread
              CPU dengan prioritas rendah, mentranskripsi satu audio pada satu waktu, dan menunggu bila export video sedang berjalan.
            </p>
          </>
        ) : null}
      </div>

      <Divider />

      <div className="mc-stack mc-gap-20">
        <h3 className="mc-h3">Groq (online)</h3>
        <SecretField
          name="groq_api_key"
          label="API key Groq"
          description={
            value.provider === 'local'
              ? 'Tidak dipakai selama mesin transkripsi diatur ke Selalu lokal.'
              : 'Opsional. Groq jauh lebih cepat dan tidak memakai CPU komputer ini. Key bisa dibuat gratis di console.groq.com.'
          }
          configured={groqConfigured}
          value={groqValue}
          onChange={onGroqValue}
          onConfiguredChange={(c) => {
            onGroqConfigured(c)
            loadStatus()
          }}
        />
        <InputField
          label="Model Whisper Groq"
          value={value.model}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
          placeholder="whisper-large-v3-turbo"
          spellCheck={false}
          mono
        />
      </div>

      <ConfirmModal
        isOpen={!!toDelete}
        title={`Hapus model ${toDelete?.label ?? ''}?`}
        message={`File model (${toDelete ? formatBytes(toDelete.size_bytes) : ''}) dihapus dari folder data. Bila dibutuhkan lagi, model diunduh ulang saat pertama dipakai.`}
        confirmLabel="Hapus model"
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}
