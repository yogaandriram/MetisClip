'use client'

import React, { useState } from 'react'
import { AlertTriangle, ExternalLink, KeyRound, ListRestart } from 'lucide-react'
import { api, type LlmProvider, type LlmSecretName, type SecretName, type Settings } from '@/lib/engine'
import { LLM_PROVIDERS, providerInfo } from '@/lib/llmProviders'
import { errorMessage } from '@/lib/format'
import { Button, ChoiceChips, Field, InputField, SelectField } from '@/components/ui'
import { SecretField } from '@/components/settings/SecretField'
import { useT } from '@/lib/i18n/I18nProvider'

export type LlmValue = Settings['llm']

interface LlmSectionProps {
  value: LlmValue
  onChange: (v: LlmValue) => void
  /** Which secrets are stored (booleans from the engine) */
  secrets: Record<SecretName, boolean>
  onSecretConfigured: (name: SecretName, configured: boolean) => void
  /** Persist the LLM settings (provider, model, base URL) so "Test" checks what is on screen */
  persist: () => Promise<void>
  allowRemove?: boolean
}

const MANUAL = '__manual__'

const inlineIcon: React.CSSProperties = { display: 'inline-block', verticalAlign: '-2px' }

/** Provider picker (six providers + OpenAI-compatible), its API key, model and, for compatible endpoints, the base URL. */
export function LlmSection({ value, onChange, secrets, onSecretConfigured, persist, allowRemove = true }: LlmSectionProps) {
  const t = useT()
  const m = t.settings.llm
  const [keys, setKeys] = useState<Partial<Record<LlmSecretName, string>>>({})
  const [models, setModels] = useState<Partial<Record<LlmProvider, string[]>>>({})
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  // null until the user chooses: there is no default provider
  const provider = providerInfo(value.provider)
  const model = provider ? value.models[provider.id] || '' : ''
  const keyValue = provider ? keys[provider.secret] || '' : ''
  const hasKey = !!provider && (secrets[provider.secret] || !!keyValue.trim())
  const list = provider ? models[provider.id] : undefined
  const compatible = value.provider === 'openai_compatible'

  const choose = (id: LlmProvider) => {
    setModelsError(null)
    onChange({ ...value, provider: id })
  }
  const setModel = (m: string) => provider && onChange({ ...value, models: { ...value.models, [provider.id]: m } })

  const loadModels = async () => {
    if (!provider) return
    setLoadingModels(true)
    setModelsError(null)
    try {
      const res = await api.llm.models(provider.id, { value: keyValue.trim() || undefined, base_url: compatible ? value.base_url : undefined })
      setModels((prev) => ({ ...prev, [provider.id]: res.models }))
      if (!res.models.length) setModelsError(m.noModels)
    } catch (err) {
      setModelsError(errorMessage(err, m.modelsFailed))
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
            <span className="mc-sr-only">{m.keyStored}</span>
          </>
        )}
      </>
    ),
  }))

  return (
    <div className="mc-stack mc-gap-20">
      <Field
        label={m.provider}
        hint={
          <>
            {m.providerHintBefore} <KeyRound size={12} aria-hidden="true" style={inlineIcon} /> {m.providerHintAfter}
          </>
        }
      >
        <ChoiceChips<LlmProvider | ''> ariaLabel={m.provider} options={providerOptions} value={value.provider} onChange={(id) => id && choose(id)} />
      </Field>

      {!provider && <span className="mc-caption mc-muted">{m.chooseProvider}</span>}

      {compatible && (
        <InputField
          label="Base URL"
          hint={m.baseUrlHint}
          placeholder="https://…/v1"
          value={value.base_url}
          onChange={(e) => onChange({ ...value, base_url: e.target.value })}
          spellCheck={false}
          mono
        />
      )}

      {provider && (
        <>
          <SecretField
            key={provider.secret}
            name={provider.secret}
            label={compatible ? m.keyLabelCompatible : m.keyLabel(provider.label)}
            description={
              provider.keyUrl ? (
                <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="mc-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {m.createKey(provider.label)} <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : (
                m.compatibleKeyHint
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
              <InputField label={m.model} value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} containerClassName="mc-grow" placeholder={m.modelPlaceholder} mono />
              <Button
                type="button"
                variant="secondary"
                onClick={loadModels}
                loading={loadingModels}
                disabled={!hasKey || (compatible && !/^https?:\/\//.test(value.base_url))}
                icon={<ListRestart size={16} aria-hidden="true" />}
              >
                {m.loadModels}
              </Button>
            </div>
            {list && list.length > 0 && (
              <SelectField
                label={m.pickFrom(list.length, provider.label)}
                value={list.includes(model) ? model : MANUAL}
                options={[...(list.includes(model) ? [] : [{ value: MANUAL, label: model ? m.typedManually(model) : m.chooseModel }]), ...list.map((m) => ({ value: m, label: m }))]}
                onChange={(e) => e.target.value !== MANUAL && setModel(e.target.value)}
              />
            )}
            {modelsError && (
              <span className="mc-field__error" role="alert">
                <AlertTriangle size={14} aria-hidden="true" />
                {modelsError}
              </span>
            )}
            {!hasKey && <span className="mc-caption mc-muted">{m.needKey(provider.label)}</span>}
          </div>
        </>
      )}
    </div>
  )
}

export default LlmSection
