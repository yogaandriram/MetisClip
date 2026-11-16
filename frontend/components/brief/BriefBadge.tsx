'use client'

import React from 'react'
import { AlertTriangle, Check, ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui'
import type { BriefCheckSummary } from '@/lib/engine'
import { briefState } from '@/lib/brief'
import { useT } from '@/lib/i18n/I18nProvider'

/** Where a campaign clip stands against its brief: unmet items first, then ticks still to do, else ready. */
export function BriefBadge({ summary, size = 'sm' }: { summary: BriefCheckSummary; size?: 'sm' | 'md' }) {
  const g = useT().brief.gallery
  const state = briefState(summary)
  if (state === 'fail') {
    return (
      <Badge tone="error" size={size} title={g.stateTitle} icon={<AlertTriangle size={14} aria-hidden="true" />}>
        {g.fail(summary.fail)}
      </Badge>
    )
  }
  if (state === 'manual') {
    return (
      <Badge tone="neutral" size={size} title={g.stateTitle} icon={<ListChecks size={14} aria-hidden="true" />}>
        {g.manual(summary.manual_open)}
      </Badge>
    )
  }
  return (
    <Badge tone="success" size={size} title={g.stateTitle} icon={<Check size={14} aria-hidden="true" />}>
      {g.ready}
    </Badge>
  )
}

export default BriefBadge
