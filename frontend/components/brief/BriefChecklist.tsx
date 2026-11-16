'use client'

import React from 'react'
import { AlertCircle, AlertTriangle, CalendarClock, CheckCircle2, Sparkles } from 'lucide-react'
import type { BriefCheckItem, BriefCheckStatus, BriefRuleStage, BriefRuleType } from '@/lib/engine'
import { formatBriefDate } from '@/lib/brief'
import { localeTag, type Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

type CheckText = Messages['brief']['check']

const ICONS: Record<Exclude<BriefCheckStatus, 'manual'>, React.ReactNode> = {
  ok: <CheckCircle2 size={16} aria-hidden="true" />,
  fail: <AlertTriangle size={16} aria-hidden="true" />,
  warn: <AlertCircle size={16} aria-hidden="true" />,
  ai: <Sparkles size={16} aria-hidden="true" />,
  info: <CalendarClock size={16} aria-hidden="true" />,
}

/** What needs the user first: unmet items, then heads-ups, then ticks still to do, then the rest. */
function priority(item: BriefCheckItem): number {
  if (item.status === 'fail') return 0
  if (item.status === 'warn') return 1
  if (item.status === 'manual' && !item.params.checked) return 2
  return 3
}

const list = (items: unknown) => (Array.isArray(items) ? items.map(String).join(', ') : '')
const tags = (items: unknown) => (Array.isArray(items) ? items.map(String).join(' ') : '')

/** One checklist line in the UI language: the line and an optional hint on how to fix it. */
export function checkText(c: CheckText, rangeText: (min: number | null, max: number | null) => string, item: BriefCheckItem): { text: string; hint?: string } {
  const p = item.params
  const ok = item.status === 'ok'
  const need = p.need === 'forbidden' ? 'forbidden' : 'required'
  switch (item.kind) {
    case 'fit':
      return { text: c.fit(Math.round(Number(p.score) || 0)), hint: p.reason || undefined }
    case 'duration': {
      const seconds = Number(p.seconds || 0).toLocaleString(localeTag(), { maximumFractionDigits: 1 })
      return { text: c.duration(seconds), hint: c.durationBrief(rangeText(p.min ?? null, p.max ?? null)) }
    }
    case 'required_words':
      return ok ? { text: c.requiredOk(list(p.found)) } : { text: c.requiredMissing(list(p.missing)), hint: c.requiredMissingHint }
    case 'banned_words':
      return ok ? { text: c.bannedOk } : { text: c.bannedFound(list(p.found)), hint: c.bannedFoundHint }
    case 'subtitles':
      return { text: c.subtitles[`${need}${ok ? 'Ok' : 'Fail'}` as keyof CheckText['subtitles']] }
    case 'logo':
      return { text: c.logo[`${need}${ok ? 'Ok' : 'Fail'}` as keyof CheckText['logo']] }
    case 'credit':
      if (need === 'forbidden') return ok ? { text: c.credit.forbiddenOk } : { text: c.credit.forbiddenFail, hint: c.credit.forbiddenHint }
      if (ok) return { text: c.credit.requiredOk }
      return {
        text: c.credit.requiredFail,
        hint: p.mode === 'full' ? c.credit.requiredFullHint : p.no_channel ? c.credit.requiredNoChannelHint : c.credit.requiredOffHint,
      }
    case 'post_copy':
      return { text: c.postMissing, hint: c.postMissingHint }
    case 'hashtags':
      return ok ? { text: c.hashtagsOk } : { text: c.hashtagsMissing(tags(p.missing)) }
    case 'mentions':
      return ok ? { text: c.mentionsOk } : { text: c.mentionsMissing(tags(p.missing)) }
    case 'disclosure':
      return { text: ok ? c.disclosureOk(String(p.label || '')) : c.disclosureMissing(String(p.label || '')) }
    case 'deadline': {
      const date = formatBriefDate(p.date, localeTag())
      const left = Number(p.days_left)
      if (left < 0) return { text: c.deadlinePassed(date) }
      if (left === 0) return { text: c.deadlineToday(date) }
      if (left === 1) return { text: c.deadlineTomorrow(date) }
      return { text: c.deadlineDays(left, date) }
    }
    case 'rule': {
      const prefix = c.rulePrefix[(p.type as BriefRuleType) in c.rulePrefix ? (p.type as BriefRuleType) : 'must']
      const stage = (p.stage as BriefRuleStage) in c.ruleStage ? (p.stage as BriefRuleStage) : 'manual'
      const where = item.status === 'ai' ? c.ruleAi : c.ruleStage[stage]
      return { text: `${prefix}${p.text || ''}`, hint: p.source ? `${where} · ${c.ruleSource(String(p.source))}` : where }
    }
    default:
      return { text: item.kind }
  }
}

interface BriefChecklistProps {
  items: BriefCheckItem[]
  /** Tick or untick a rule only the user can check */
  onToggle: (rule: string, checked: boolean) => void
  /** Rule id being saved */
  busyRule?: string | null
}

/** The clip's brief checklist (services/brief_check.py), most urgent first. The fit score is shown elsewhere. */
export function BriefChecklist({ items, onToggle, busyRule }: BriefChecklistProps) {
  const t = useT()
  const c = t.brief.check
  const rows = items.filter((it) => it.kind !== 'fit').sort((a, b) => priority(a) - priority(b))
  if (rows.length === 0) return <p className="mc-caption mc-muted">{t.brief.panel.checklistEmpty}</p>
  return (
    <ul className="mc-brief-list">
      {rows.map((item) => {
        const { text, hint } = checkText(c, t.brief.range, item)
        if (item.status === 'manual') {
          const rule = String(item.params.rule || '')
          const checked = !!item.params.checked
          return (
            <li key={item.id} className={`mc-brief-item mc-brief-item--manual${checked ? ' mc-brief-item--done' : ''}`}>
              <label className="mc-brief-item__check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busyRule === rule}
                  aria-label={c.manualAria(text)}
                  onChange={(e) => onToggle(rule, e.target.checked)}
                />
                <span className="mc-brief-item__body">
                  <span className="mc-brief-item__text">{text}</span>
                  {hint && <span className="mc-brief-item__hint">{hint}</span>}
                </span>
              </label>
            </li>
          )
        }
        return (
          <li key={item.id} className={`mc-brief-item mc-brief-item--${item.status}`}>
            <span className="mc-brief-item__icon">{ICONS[item.status]}</span>
            <span className="mc-brief-item__body">
              <span className="mc-sr-only">{c.status[item.status]}: </span>
              <span className="mc-brief-item__text">{text}</span>
              {hint && <span className="mc-brief-item__hint">{hint}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default BriefChecklist
