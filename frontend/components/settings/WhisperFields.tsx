'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Download, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Badge, Button, Card, ChoiceChips, ConfirmModal, Divider, Field, InputField, ProgressBar, SelectField, Skeleton } from '@/components/ui'
import { SecretField } from '@/components/settings/SecretField'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Settings, type WhisperModelId, type WhisperModelInfo, type WhisperProvider, type WhisperStatus } from '@/lib/engine'
import { errorMessage, formatBytes } from '@/lib/format'
import { localeTag, type Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

type WhisperSettings = Settings['whisper']

const PROVIDERS: WhisperProvider[] = ['auto', 'local', 'groq']

const MODEL_LABEL: Record<WhisperModelId, string> = { small: 'Small', 'large-v3-turbo': 'Large v3 Turbo' }

function providerHint(m: Messages['settings']['whisper'], provider: WhisperProvider, groqKey: boolean, localOk: boolean): string {
  if (provider === 'groq') return m.hintGroq
  if (provider === 'local') return m.hintLocal
  if (!localOk) return m.hintNoLocal
  return groqKey ? m.hintAutoWithKey : m.hintAutoNoKey
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
  const t = useT()
  const m = t.settings.whisper
  const [status, setStatus] = useState<WhisperStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<WhisperModelInfo | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.whisper.status())
      setStatusError(null)
    } catch (err) {
      setStatusError(errorMessage(err, m.statusFailed))
    }
  }, [m.statusFailed])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEngineEvents((e) => {
    if (e.type !== 'whisper.download') return
    if (e.status === 'downloading') {
      setStatus((s) =>
        s
          ? { ...s, models: s.models.map((x) => (x.id === e.id ? { ...x, download: { status: 'downloading', progress: e.progress, error: null } } : x)) }
          : s,
      )
      return
    }
    if (e.status === 'completed') toast.success(m.modelReady(MODEL_LABEL[e.id]))
    if (e.status === 'failed') toast.error(e.message || m.downloadFailed)
    loadStatus()
  })

  const download = async (id: WhisperModelId) => {
    try {
      await api.whisper.download(id)
      setStatus((s) =>
        s ? { ...s, models: s.models.map((x) => (x.id === id ? { ...x, download: { status: 'downloading', progress: 0, error: null } } : x)) } : s,
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
      toast.success(m.modelRemoved(toDelete.label))
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
    const transcript = effective.transcript === id
    const subtitle = effective.subtitle === id
    return transcript && subtitle ? m.usedForBoth : transcript ? m.usedForTranscript : subtitle ? m.usedForSubtitle : null
  }

  const autoHint = status
    ? m.autoHint(
        status.cpu_cores,
        status.ram_gb.toLocaleString(localeTag()),
        MODEL_LABEL[status.local.auto_models.transcript],
        MODEL_LABEL[status.local.auto_models.subtitle],
      )
    : undefined

  return (
    <div className="mc-stack mc-gap-20">
      <Field label={m.engine} hint={providerHint(m, value.provider, groqConfigured, localOk)}>
        <ChoiceChips
          ariaLabel={m.engine}
          options={PROVIDERS.map((p) => ({ value: p, label: m.providers[p] }))}
          value={value.provider}
          onChange={(provider) => onChange({ ...value, provider })}
        />
      </Field>

      <Divider />

      <div className="mc-stack mc-gap-12">
        <h3 className="mc-h3">{m.localHeading}</h3>
        {statusError && (
          <Alert
            tone="error"
            action={
              <Button variant="secondary" size="sm" onClick={loadStatus}>
                {t.common.retry}
              </Button>
            }
          >
            {statusError}
          </Alert>
        )}
        {!status && !statusError ? (
          <Skeleton height={120} radius="md" />
        ) : status && !status.local.available ? (
          <Alert tone="warning" title={m.localMissingTitle}>
            {m.localMissingBody}
          </Alert>
        ) : status ? (
          <>
            <SelectField
              label={m.localModel}
              hint={value.local_model === 'auto' ? autoHint : m.fixedModelHint}
              value={value.local_model}
              options={[
                { value: 'auto', label: m.modelOptions.auto },
                { value: 'small', label: m.modelOptions.small },
                { value: 'large-v3-turbo', label: m.modelOptions['large-v3-turbo'] },
              ]}
              onChange={(e) => onChange({ ...value, local_model: e.target.value as WhisperSettings['local_model'] })}
            />
            <div className="mc-stack mc-gap-8">
              {status.models.map((model) => {
                const dl = model.download
                const downloading = dl?.status === 'downloading'
                const use = usedFor(model.id)
                return (
                  <Card key={model.id} tone="dew" padding="sm" className="mc-stack mc-gap-8">
                    <div className="mc-row mc-row--wrap mc-gap-12">
                      <div className="mc-stack mc-gap-4 mc-grow" style={{ minWidth: 220 }}>
                        <div className="mc-row mc-row--wrap mc-gap-8">
                          <span className="mc-label">{model.label}</span>
                          <span className="mc-mono mc-caption">{formatBytes(model.size_bytes)}</span>
                          {model.installed ? (
                            <Badge tone="success" size="sm">
                              {m.installed}
                            </Badge>
                          ) : downloading ? (
                            <Badge tone="ink" size="sm">
                              {m.downloading}
                            </Badge>
                          ) : (
                            <Badge tone="neutral" size="sm" icon={<Download size={14} aria-hidden="true" />}>
                              {m.notDownloaded}
                            </Badge>
                          )}
                        </div>
                        <span className="mc-caption mc-muted">{model.description}</span>
                        {use && <span className="mc-caption">{use}</span>}
                      </div>
                      <div className="mc-row mc-gap-8">
                        {model.installed ? (
                          <Button variant="ghost" size="sm" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setToDelete(model)}>
                            {t.common.delete}
                          </Button>
                        ) : downloading ? (
                          <Button variant="ghost" size="sm" icon={<X size={16} aria-hidden="true" />} onClick={() => cancel(model.id)}>
                            {m.cancelDownload}
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" icon={<Download size={16} aria-hidden="true" />} onClick={() => download(model.id)}>
                            {m.download}
                          </Button>
                        )}
                      </div>
                    </div>
                    {downloading && <ProgressBar value={dl.progress} label={m.downloadProgress(model.label)} showValue />}
                    {dl?.status === 'failed' && dl.error && <span className="mc-caption">{dl.error}</span>}
                  </Card>
                )
              })}
            </div>
            <p className="mc-caption mc-muted">
              {m.localNote(status.local.threads)}
            </p>
          </>
        ) : null}
      </div>

      <Divider />

      <div className="mc-stack mc-gap-20">
        <h3 className="mc-h3">{m.groqHeading}</h3>
        <SecretField
          name="groq_api_key"
          label={m.groqKey}
          description={
            value.provider === 'local'
              ? m.groqUnused
              : m.groqOptional
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
          label={m.groqModel}
          value={value.model}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
          placeholder="whisper-large-v3-turbo"
          spellCheck={false}
          mono
        />
      </div>

      <ConfirmModal
        isOpen={!!toDelete}
        title={m.removeTitle(toDelete?.label ?? '')}
        message={m.removeMessage(toDelete ? formatBytes(toDelete.size_bytes) : '')}
        confirmLabel={m.removeConfirm}
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}
