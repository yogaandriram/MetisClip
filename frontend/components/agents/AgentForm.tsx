'use client'

import React, { useState } from 'react'
import type { AgentInput } from '@/lib/engine'
import { CLIP_DURATION_OPTIONS, VIDEO_TYPE_OPTIONS } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/InputField'
import { SelectField } from '@/components/ui/SelectField'

export interface AgentFormValue {
  name: string
  niche: string
  default_duration: string
  default_keywords: string
  default_video_type: string
}

export const EMPTY_AGENT_FORM: AgentFormValue = {
  name: '',
  niche: '',
  default_duration: '45-60',
  default_keywords: '',
  default_video_type: 'podcast',
}

export function toAgentInput(v: AgentFormValue): AgentInput {
  return {
    name: v.name.trim(),
    niche: v.niche.trim() || null,
    default_duration: v.default_duration,
    default_keywords: v.default_keywords.trim() || null,
    default_video_types: [v.default_video_type],
    timezone: 'Asia/Jakarta',
  }
}

interface AgentFormProps {
  initial?: AgentFormValue
  submitLabel: string
  onSubmit: (value: AgentFormValue) => Promise<void>
  onCancel?: () => void
}

export function AgentForm({ initial = EMPTY_AGENT_FORM, submitLabel, onSubmit, onCancel }: AgentFormProps) {
  const [value, setValue] = useState<AgentFormValue>(initial)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.name.trim()) return
    setBusy(true)
    try {
      await onSubmit(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <InputField label="Nama Agent" placeholder="Misal: AI Tech Clipper" value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} required maxLength={80} />
        <InputField label="Fokus Niche" placeholder="Misal: Teknologi & AI, Bisnis" value={value.niche} onChange={(e) => setValue({ ...value, niche: e.target.value })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <SelectField label="Durasi Clip Default" value={value.default_duration} options={CLIP_DURATION_OPTIONS} onChange={(e) => setValue({ ...value, default_duration: e.target.value })} />
        <SelectField label="Tipe Konten Default" value={value.default_video_type} options={VIDEO_TYPE_OPTIONS} onChange={(e) => setValue({ ...value, default_video_type: e.target.value })} />
        <InputField
          label="Keyword Default"
          placeholder="Pisahkan dengan koma: AI, startup"
          value={value.default_keywords}
          onChange={(e) => setValue({ ...value, default_keywords: e.target.value })}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Batal
          </Button>
        )}
        <Button type="submit" variant="primary" loading={busy} disabled={!value.name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

export default AgentForm
