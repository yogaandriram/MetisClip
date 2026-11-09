'use client'

import React, { useState } from 'react'
import { CheckCircle2, ExternalLink, ListRestart } from 'lucide-react'
import { api, type LlmProvider, type LlmSecretName, type SecretName, type Settings } from '@/lib/engine'
import { COMPATIBLE_ENDPOINTS, LLM_PROVIDERS, providerInfo } from '@/lib/llmProviders'
import { errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/InputField'
import { SelectField } from '@/components/ui/SelectField'
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
  const endpoint = COMPATIBLE_ENDPOINTS.find((e) => e.base_url === value.base_url.replace(/\/+$/, ''))

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '10px' }}>Penyedia LLM</div>
        <div role="radiogroup" aria-label="Penyedia LLM" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
          {LLM_PROVIDERS.map((p) => {
            const active = p.id === value.provider
            const stored = secrets[p.secret]
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => choose(p.id)}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  background: active ? 'rgba(24, 86, 255, 0.14)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border-glass)'}`,
                  boxShadow: active ? '0 0 0 1px var(--primary) inset' : 'none',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  minWidth: 0,
                  // The compatible endpoint has the longest name and hint: give it two columns
                  gridColumn: p.id === 'openai_compatible' ? 'span 2' : undefined,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                  {stored && <CheckCircle2 size={13} color="var(--accent)" style={{ flexShrink: 0 }} aria-label="API key tersimpan" />}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.family}</span>
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
          Dipakai untuk menganalisis transkrip, memilih momen viral, dan menandai kata kunci/emoji. Tanda <CheckCircle2 size={11} color="var(--accent)" style={{ verticalAlign: '-1px' }} /> berarti API key penyedia itu sudah tersimpan.
        </p>
      </div>

      {compatible && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) 1fr', gap: '12px' }}>
          <SelectField
            label="Layanan"
            value={endpoint?.id || MANUAL}
            options={[...COMPATIBLE_ENDPOINTS.map((e) => ({ value: e.id, label: e.label })), { value: MANUAL, label: 'Lainnya (isi Base URL)' }]}
            onChange={(e) => {
              const picked = COMPATIBLE_ENDPOINTS.find((x) => x.id === e.target.value)
              if (picked) onChange({ ...value, base_url: picked.base_url })
            }}
          />
          <InputField label="Base URL" placeholder="https://…/v1" value={value.base_url} onChange={(e) => onChange({ ...value, base_url: e.target.value })} spellCheck={false} />
        </div>
      )}

      <SecretField
        key={provider.secret}
        name={provider.secret}
        label={compatible ? 'API key OpenAI-compatible' : `API key ${provider.label}`}
        description={
          provider.keyUrl ? (
            <a href={provider.keyUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Buat API key {provider.label} <ExternalLink size={11} />
            </a>
          ) : (
            'Key dari layanan yang Anda pilih di atas (mis. 9Router, Groq, OpenRouter).'
          )
        }
        configured={secrets[provider.secret]}
        value={keyValue}
        onChange={(v) => setKeys((prev) => ({ ...prev, [provider.secret]: v }))}
        onConfiguredChange={(c) => onSecretConfigured(provider.secret, c)}
        beforeTest={persist}
        allowRemove={allowRemove}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <InputField label="Model" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} containerStyle={{ flex: 1 }} placeholder="Nama model" />
          <Button type="button" variant="secondary" size="sm" onClick={loadModels} loading={loadingModels} disabled={!hasKey || (compatible && !/^https?:\/\//.test(value.base_url))} icon={<ListRestart size={14} />} style={{ height: '46px' }}>
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
        {modelsError && <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{modelsError}</span>}
        {!hasKey && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Isi API key dulu untuk memuat daftar model dari {provider.label}.</span>}
      </div>
    </div>
  )
}

export default LlmSection
