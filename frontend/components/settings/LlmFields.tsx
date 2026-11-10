'use client'

import React, { useState } from 'react'
import { AlertTriangle, ExternalLink, KeyRound, ListRestart } from 'lucide-react'
import { api, type LlmProvider, type LlmSecretName, type SecretName, type Settings } from '@/lib/engine'
import { LLM_PROVIDERS, providerInfo } from '@/lib/llmProviders'
import { errorMessage } from '@/lib/format'
import { Button, ChoiceChips, Field, InputField, SelectField } from '@/components/ui'
import { SecretField } from '@/components/settings/SecretField'

export type LlmValue = Settings['llm']

interface LlmSectionProps {
  value: LlmValue
  onChange: (v: LlmValue) => void
  /** Which secrets are stored (booleans from the engine) */
  secrets: Record<SecretName, boolean>
  onSecretConfigured: (name: SecretName, configured: boolean) => void
  /** Persist the LLM settings (provider, model, base URL) so "Tes" checks what is on screen */
  persist: () => Promise<void>
  allowRemove?: boolean
}

const MANUAL = '__manual__'

const inlineIcon: React.CSSProperties = { display: 'inline-block', verticalAlign: '-2px' }

/** Provider picker (six providers + OpenAI-compatible), its API key, model and, for compatible endpoints, the base URL. */
export function LlmSection({ value, onChange, secrets, onSecretConfigured, persist, allowRemove = true }: LlmSectionProps) {
  const [keys, setKeys] = useState<Partial<Record<LlmSecretName, string>>>({})
  const [models, setModels] = useState<Partial<Record<LlmProvider, string[]>>>({})
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const provider = providerInfo(value.provider)
  const model = value.models[value.provider] || ''
  const keyValue = keys[provider.secret] || ''
  const hasKey = secrets[provider.secret] || !!keyValue.trim()
  const list = models[value.provider]
  const compatible = value.provider === 'openai_compatible'

  const choose = (id: LlmProvider) => {
    setModelsError(null)
    onChange({ ...value, provider: id })
  }
  const setModel = (m: string) => onChange({ ...value, models: { ...value.models, [value.provider]: m } })

  const loadModels = async () => {
    setLoadingModels(true)
    setModelsError(null)
    try {
      const res = await api.llm.models(value.provider, { value: keyValue.trim() || undefined, base_url: compatible ? value.base_url : undefined })
      setModels((prev) => ({ ...prev, [value.provider]: res.models }))
      if (!res.models.length) setModelsError('Penyedia tidak mengembalikan model teks. Ketik nama model secara manual.')
    } catch (err) {
      setModelsError(errorMessage(err, 'Daftar model gagal dimuat'))
    } finally {
      setLoadingModels(false)
    }
  }

  const providerOptions = LLM_PROVIDERS.map((p) => ({
    value: p.id,
    label: (
      <>
        {p.id === 'openai_compatible' || p.family === p.label ? p.label : `${p.label} · ${p.family}`}
        {secrets[p.secret] && (
          <>
            <KeyRound size={14} aria-hidden="true" />
            <span className="mc-sr-only">, API key tersimpan</span>
          </>
        )}
      </>
    ),
  }))

  return (
    <div className="mc-stack mc-gap-20">
      <Field
        label="Penyedia LLM"
        hint={
          <>
            Dipakai untuk menganalisis transkrip, memilih momen viral, dan menandai kata kunci/emoji. Tanda <KeyRound size={12} aria-hidden="true" style={inlineIcon} /> berarti
            API key penyedia itu sudah tersimpan.
          </>
        }
      >
        <ChoiceChips ariaLabel="Penyedia LLM" options={providerOptions} value={value.provider} onChange={choose} />
      </Field>

      {compatible && (
        <InputField
          label="Base URL"
          hint="Alamat endpoint yang memakai format API OpenAI, biasanya diakhiri /v1."
          placeholder="https://…/v1"
          value={value.base_url}
          onChange={(e) => onChange({ ...value, base_url: e.target.value })}
          spellCheck={false}
          mono
        />
      )}

      <SecretField
        key={provider.secret}
        name={provider.secret}
        label={compatible ? 'API key OpenAI-compatible' : `API key ${provider.label}`}
        description={
          provider.keyUrl ? (
            <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="mc-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Buat API key {provider.label} <ExternalLink size={14} aria-hidden="true" />
            </a>
          ) : (
            'Key dari layanan pemilik Base URL di atas.'
          )
        }
        configured={secrets[provider.secret]}
        value={keyValue}
        onChange={(v) => setKeys((prev) => ({ ...prev, [provider.secret]: v }))}
        onConfiguredChange={(c) => onSecretConfigured(provider.secret, c)}
        beforeTest={persist}
        allowRemove={allowRemove}
      />

      <div className="mc-stack mc-gap-8">
        <div className="mc-row mc-gap-8" style={{ alignItems: 'flex-end' }}>
          <InputField label="Model" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} containerClassName="mc-grow" placeholder="Nama model" mono />
          <Button
            type="button"
            variant="secondary"
            onClick={loadModels}
            loading={loadingModels}
            disabled={!hasKey || (compatible && !/^https?:\/\//.test(value.base_url))}
            icon={<ListRestart size={16} aria-hidden="true" />}
          >
            Muat daftar model
          </Button>
        </div>
        {list && list.length > 0 && (
          <SelectField
            label={`Pilih dari ${list.length} model ${provider.label}`}
            value={list.includes(model) ? model : MANUAL}
            options={[...(list.includes(model) ? [] : [{ value: MANUAL, label: model ? `${model} (diketik manual)` : 'Pilih model…' }]), ...list.map((m) => ({ value: m, label: m }))]}
            onChange={(e) => e.target.value !== MANUAL && setModel(e.target.value)}
          />
        )}
        {modelsError && (
          <span className="mc-field__error" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            {modelsError}
          </span>
        )}
        {!hasKey && <span className="mc-caption mc-muted">Isi API key dulu untuk memuat daftar model dari {provider.label}.</span>}
      </div>
    </div>
  )
}

export default LlmSection
