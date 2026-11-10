'use client'

import React, { useEffect, useState } from 'react'
import { api, type AgentInput, type BrandTemplate } from '@/lib/engine'
import { CLIP_DURATION_OPTIONS } from '@/lib/format'
import { Button, InputField, SelectField } from '@/components/ui'

export interface AgentFormValue {
  name: string
  niche: string
  default_duration: string
  /** '' = the oldest template in the library */
  default_brand_template_id: string
}

export const EMPTY_AGENT_FORM: AgentFormValue = {
  name: '',
  niche: '',
  default_duration: '45-60',
  default_brand_template_id: '',
}

export function toAgentInput(v: AgentFormValue): AgentInput {
  return {
    name: v.name.trim(),
    niche: v.niche.trim() || null,
    default_duration: v.default_duration,
    timezone: 'Asia/Jakarta',
    ...(v.default_brand_template_id ? { default_brand_template_id: v.default_brand_template_id } : {}),
  }
}

interface AgentFormProps {
  initial?: AgentFormValue
  submitLabel: string
  onSubmit: (value: AgentFormValue) => Promise<void>
  onCancel?: () => void
}

const FIELD_GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'start' }

export function AgentForm({ initial = EMPTY_AGENT_FORM, submitLabel, onSubmit, onCancel }: AgentFormProps) {
  const [value, setValue] = useState<AgentFormValue>(initial)
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState<BrandTemplate[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api.brandTemplates
      .list()
      .then(({ brand_templates }) => {
        if (cancelled) return
        setTemplates(brand_templates)
        // New agents: show the template the engine would pick (the oldest one)
        setValue((v) => (v.default_brand_template_id || !brand_templates.length ? v : { ...v, default_brand_template_id: brand_templates[0].id }))
      })
      .catch(() => setTemplates([]))
    return () => {
      cancelled = true
    }
  }, [])

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
    <form onSubmit={submit} className="mc-stack mc-gap-24">
      <div style={FIELD_GRID}>
        <InputField label="Nama agent" placeholder="Misal: AI Tech Clipper" value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} required maxLength={80} />
        <InputField label="Fokus niche" placeholder="Misal: Teknologi & AI, Bisnis" value={value.niche} onChange={(e) => setValue({ ...value, niche: e.target.value })} />
      </div>
      <div style={FIELD_GRID}>
        <SelectField label="Durasi klip default" value={value.default_duration} options={CLIP_DURATION_OPTIONS} onChange={(e) => setValue({ ...value, default_duration: e.target.value })} />
        {templates && templates.length > 0 && (
          <SelectField
            label="Brand template default"
            hint="Dipakai oleh clip baru dari agent ini. Tiap clip tetap bisa diganti template-nya di editor."
            value={value.default_brand_template_id}
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(e) => setValue({ ...value, default_brand_template_id: e.target.value })}
          />
        )}
      </div>
      <div className="mc-row mc-row--end mc-gap-8">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
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
