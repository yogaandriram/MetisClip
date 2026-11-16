'use client'

import React from 'react'
import { ChevronDown, ListChecks, Quote, Settings, Sparkles, Wand2 } from 'lucide-react'
import type { BrandTemplate, TemplateDesignNote } from '@/lib/engine'
import { Alert, Button, ButtonLink, Card, Spinner } from '@/components/ui'
import type { Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

interface TemplateDesignCardProps {
  template: BrandTemplate
  busy: boolean
  onDesign: () => void
  onOpenLogo: () => void
}

function noteText(note: TemplateDesignNote, t: Messages): string {
  const notes = t.brand.design.notes as Record<string, string>
  return notes[note.kind] || t.brand.design.notes.other
}

/** How the AI made the open template: running, its reasons and what it left to the user, or why it could not. */
export function TemplateDesignCard({ template, busy, onDesign, onOpenLogo }: TemplateDesignCardProps) {
  const t = useT()
  const d = template.design
  if (!d) return null

  const notes = d.notes || []
  const todo = notes.length > 0 && (
    <div className="mc-stack mc-gap-8">
      <p className="mc-label mc-row mc-gap-8">
        <ListChecks size={16} aria-hidden="true" />
        {t.brand.design.todo}
      </p>
      <ul className="mc-stack mc-gap-4" style={{ listStyle: 'none' }}>
        {notes.map((note, i) => (
          <li key={`${note.kind}-${i}`} className="mc-row mc-row--between mc-row--top mc-gap-8">
            <span>{noteText(note, t)}</span>
            {note.kind === 'logo' && (
              <Button variant="ghost" size="sm" onClick={onOpenLogo}>
                {t.brand.design.openLogo}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )

  if (d.status === 'running') {
    return (
      <Alert tone="info" icon={<Spinner size="sm" />} title={t.brand.design.runningTitle}>
        {t.brand.design.runningBody}
      </Alert>
    )
  }

  if (d.status === 'failed' || d.status === 'basic' || d.status === 'skipped') {
    const title = d.status === 'failed' ? t.brand.design.failedTitle : d.status === 'skipped' ? t.brand.design.skippedTitle : t.brand.design.basicTitle
    const noKey = d.status === 'basic' && !!d.message
    return (
      <Alert
        tone={d.status === 'failed' ? 'error' : 'info'}
        title={title}
        action={
          <div className="mc-row mc-gap-8">
            {noKey && (
              <ButtonLink href="/settings/" variant="ghost" size="sm" icon={<Settings size={16} aria-hidden="true" />}>
                {t.brand.design.openSettings}
              </ButtonLink>
            )}
            <Button variant="secondary" size="sm" onClick={onDesign} loading={busy} icon={<Sparkles size={16} aria-hidden="true" />}>
              {d.status === 'failed' ? t.brand.design.retry : d.status === 'skipped' ? t.brand.design.redesign : t.brand.design.designNow}
            </Button>
          </div>
        }
      >
        <div className="mc-stack mc-gap-12">
          <p>{d.message || t.brand.design.basicBody}</p>
          {todo}
        </div>
      </Alert>
    )
  }

  // done
  const reasons = d.reasons || []
  return (
    <Card padding="sm" tone="dew" as="section" aria-labelledby="template-design-title">
      <div className="mc-stack mc-gap-12">
        <div className="mc-row mc-row--between mc-row--top mc-gap-8">
          <div className="mc-grow" style={{ minWidth: 0 }}>
            <p id="template-design-title" className="mc-label mc-row mc-gap-8">
              <Sparkles size={16} aria-hidden="true" />
              {t.brand.design.doneTitle}
            </p>
            {d.provider && d.model && <p className="mc-caption mc-muted">{t.brand.design.model(d.provider, d.model)}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onDesign} loading={busy} icon={<Wand2 size={16} aria-hidden="true" />}>
            {t.brand.design.redesign}
          </Button>
        </div>

        {d.auto && <p className="mc-caption">{d.edited ? t.brand.design.edited : t.brand.design.followsBrief}</p>}

        {reasons.length > 0 && (
          <details className="mc-design-reasons">
            <summary className="mc-row mc-gap-8 mc-label">
              <ChevronDown size={16} aria-hidden="true" className="mc-design-reasons__chevron" />
              {t.brand.design.why}
            </summary>
            <ul className="mc-stack mc-gap-8" style={{ listStyle: 'none', marginTop: 'var(--s-3)' }}>
              {reasons.map((r, i) => (
                <li key={i} className="mc-stack mc-gap-4">
                  <p>
                    <span className="mc-label">{t.brand.design.parts[r.part] || r.part}</span> · {r.text}
                  </p>
                  {r.quote && (
                    <p className="mc-caption mc-muted mc-row mc-row--top mc-gap-8">
                      <Quote size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
                      <span>{t.brand.design.quote(r.quote)}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {todo}
      </div>
    </Card>
  )
}

export default TemplateDesignCard
