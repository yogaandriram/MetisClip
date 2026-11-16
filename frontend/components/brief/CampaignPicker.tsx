'use client'

import React from 'react'
import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { Alert, ButtonLink, Chip, Skeleton } from '@/components/ui'
import type { Campaign } from '@/lib/engine'
import { MAX_CAMPAIGNS_PER_JOB, daysUntil, formatBriefDate, isBriefEmpty, shownClient } from '@/lib/brief'
import { localeTag } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

interface CampaignPickerProps {
  /** Active campaigns; null while loading */
  campaigns: Campaign[] | null
  error?: string | null
  value: string[]
  onChange: (ids: string[]) => void
}

/** Cari Video: the campaigns a job follows (up to MAX_CAMPAIGNS_PER_JOB), with warnings about their briefs. */
export function CampaignPicker({ campaigns, error, value, onChange }: CampaignPickerProps) {
  const t = useT()
  const p = t.brief.picker
  const labelId = React.useId()
  const full = value.length >= MAX_CAMPAIGNS_PER_JOB
  const chosen = (campaigns || []).filter((c) => value.includes(c.id))

  const warnings: string[] = []
  for (const c of chosen) {
    if (isBriefEmpty(c.brief)) warnings.push(p.emptyBrief(c.name))
    const left = daysUntil(c.brief?.deadline)
    if (left !== null && left < 0) warnings.push(p.deadlinePassed(c.name, formatBriefDate(c.brief?.deadline, localeTag())))
  }

  let body: React.ReactNode
  if (error) {
    body = <Alert tone="error">{error}</Alert>
  } else if (campaigns === null) {
    body = (
      <div className="mc-row mc-gap-8">
        <Skeleton height={32} width={140} radius="full" />
        <Skeleton height={32} width={110} radius="full" />
      </div>
    )
  } else if (campaigns.length === 0) {
    body = (
      <div className="mc-brief-picker__empty">
        <span className="mc-muted">{p.none}</span>
        <ButtonLink href="/campaigns/" variant="secondary" size="sm" icon={<Megaphone size={16} aria-hidden="true" />}>
          {p.create}
        </ButtonLink>
      </div>
    )
  } else {
    body = (
      <div role="group" aria-labelledby={labelId} className="mc-row mc-row--wrap mc-gap-8">
        {campaigns.map((c) => {
          const on = value.includes(c.id)
          return (
            <Chip
              key={c.id}
              selected={on}
              disabled={!on && full}
              icon={<Megaphone size={14} aria-hidden="true" />}
              onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}
            >
              <span className="mc-truncate" style={{ maxWidth: 220 }} title={shownClient(c) ? `${c.name} · ${shownClient(c)}` : c.name}>
                {c.name}
                {shownClient(c) && <span className="mc-brief-picker__client"> · {shownClient(c)}</span>}
              </span>
            </Chip>
          )
        })}
      </div>
    )
  }

  return (
    <div className="mc-stack mc-gap-8">
      <div className="mc-row mc-row--between mc-gap-8">
        <span id={labelId} className="mc-field__label">
          {p.label}
        </span>
        {campaigns && campaigns.length > 0 && (
          <Link href="/campaigns/" className="mc-link mc-caption">
            {p.manage}
          </Link>
        )}
      </div>
      {body}
      {campaigns && campaigns.length > 0 && (
        <span className="mc-field__hint">{full ? p.limitReached(MAX_CAMPAIGNS_PER_JOB) : p.hint(MAX_CAMPAIGNS_PER_JOB)}</span>
      )}
      {warnings.length > 0 && (
        <Alert tone="warning">
          {warnings.length === 1 ? (
            warnings[0]
          ) : (
            <ul className="mc-stack mc-gap-4" style={{ listStyle: 'none' }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </div>
  )
}

export default CampaignPicker
