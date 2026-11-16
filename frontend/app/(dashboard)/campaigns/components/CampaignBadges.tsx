import React from 'react'
import { AlertTriangle, CalendarClock, Check } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui'

type BadgeInfo = { label: string; tone: BadgeTone }

/** Reading state of a campaign's brief (running, waiting for review, failed). */
export function ParseBadge({ badge, size = 'sm' }: { badge: BadgeInfo; size?: 'sm' | 'md' }) {
  const icon =
    badge.tone === 'ink' ? (
      <span className="mc-spinner mc-spinner--sm" aria-hidden="true" />
    ) : badge.tone === 'error' ? (
      <AlertTriangle size={14} aria-hidden="true" />
    ) : (
      <Check size={14} aria-hidden="true" />
    )
  return (
    <Badge tone={badge.tone} size={size} icon={icon}>
      {badge.label}
    </Badge>
  )
}

/** The brief's deadline with days left or overdue. */
export function DeadlineBadge({ badge, size = 'sm' }: { badge: BadgeInfo; size?: 'sm' | 'md' }) {
  return (
    <Badge
      tone={badge.tone}
      size={size}
      icon={badge.tone === 'warning' ? <AlertTriangle size={14} aria-hidden="true" /> : <CalendarClock size={14} aria-hidden="true" />}
    >
      {badge.label}
    </Badge>
  )
}
