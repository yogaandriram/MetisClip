'use client'

import React, { useRef } from 'react'
import type { LlmPreset, Settings } from '@/lib/engine'
import { InputField } from '@/components/ui/InputField'
import { SelectField } from '@/components/ui/SelectField'

export type LlmValue = Settings['llm']

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
export const DEFAULT_LLM_MODEL = 'llama-3.3-70b-versatile'

const PRESET_OPTIONS: { value: LlmPreset; label: string }[] = [
  { value: '9router', label: '9router (default)' },
  { value: 'groq', label: 'Groq' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' },
]

/** Provider preset + base URL + model for the OpenAI-compatible LLM endpoint. */
export function LlmFields({ value, onChange }: { value: LlmValue; onChange: (v: LlmValue) => void }) {
  // Remember the last values seen per preset so switching back restores them (e.g. the engine's 9router default)
  const remembered = useRef<Partial<Record<LlmPreset, LlmValue>>>({})
  remembered.current[value.preset] = value

  const setPreset = (preset: LlmPreset) => {
    const prev = remembered.current[preset]
    if (prev) onChange({ ...prev, preset })
    else if (preset === 'groq') onChange({ preset, base_url: GROQ_BASE_URL, model: DEFAULT_LLM_MODEL })
    else onChange({ preset, base_url: value.preset === 'groq' ? '' : value.base_url, model: value.model })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
      <SelectField label="Penyedia LLM" value={value.preset} options={PRESET_OPTIONS} onChange={(e) => setPreset(e.target.value as LlmPreset)} />
      <InputField
        label="Base URL"
        placeholder="https://…/v1"
        value={value.base_url}
        disabled={value.preset === 'groq'}
        onChange={(e) => onChange({ ...value, base_url: e.target.value })}
      />
      <InputField label="Model" placeholder={DEFAULT_LLM_MODEL} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} />
    </div>
  )
}

export default LlmFields
