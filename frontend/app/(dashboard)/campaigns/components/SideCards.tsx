'use client'

import React, { useState } from 'react'
import { Archive, ArchiveRestore, Clapperboard, Copy, Film, MessageCircleQuestion, Palette, Settings2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Button, ButtonLink, Card, CardHeader, Divider, InputField, ProgressRow, SelectField, TagInput } from '@/components/ui'
import type { BrandTemplate, Campaign } from '@/lib/engine'
import { useT } from '@/lib/i18n/I18nProvider'
import { DeadlineBadge } from './CampaignBadges'
import { deadlineBadge } from './helpers'

export interface CampaignDetails {
  name: string
  client: string
  brand_template_id: string | null
}

export function detailsOf(campaign: Campaign): CampaignDetails {
  return { name: campaign.name, client: campaign.client || '', brand_template_id: campaign.brand_template_id ?? null }
}

export function sameDetails(a: CampaignDetails, b: CampaignDetails): boolean {
  return a.name === b.name && a.client === b.client && a.brand_template_id === b.brand_template_id
}

interface DetailsCardProps {
  campaign: Campaign
  details: CampaignDetails
  onDetails: (details: CampaignDetails) => void
  /** The campaign's own templates (one of them its default) */
  templates: BrandTemplate[]
  /** Open Brand Template on this campaign's templates */
  onManageTemplates: () => void
  nameError?: string | null
  archiving: boolean
  onToggleArchive: () => void
  onDelete: () => void
}

/** Name, client and brand template (saved with the page's Save), plus archive and delete (applied at once). */
export function DetailsCard({ campaign, details, onDetails, templates, onManageTemplates, nameError, archiving, onToggleArchive, onDelete }: DetailsCardProps) {
  const t = useT()
  const m = t.campaign.info
  const archived = campaign.status === 'archived'
  const options = templates.map((tpl) => ({
    value: tpl.id,
    label: tpl.design?.status === 'running' ? `${tpl.name} · ${m.templateDesigning}` : tpl.name,
  }))
  const value = details.brand_template_id && templates.some((tpl) => tpl.id === details.brand_template_id) ? details.brand_template_id : templates[0]?.id || ''

  return (
    <Card as="section" padding="sm">
      <CardHeader size="sm" icon={<Settings2 size={18} aria-hidden="true" />} title={m.title} />
      <div className="mc-stack">
        <InputField
          label={m.name}
          value={details.name}
          maxLength={80}
          error={nameError || undefined}
          onChange={(e) => onDetails({ ...details, name: e.target.value })}
        />
        <InputField
          label={m.client}
          value={details.client}
          maxLength={80}
          placeholder={m.clientPlaceholder}
          onChange={(e) => onDetails({ ...details, client: e.target.value })}
        />
        <div className="mc-stack mc-gap-8">
          <SelectField
            label={m.template}
            hint={m.templateHint}
            options={options}
            value={value}
            disabled={!options.length}
            onChange={(e) => onDetails({ ...details, brand_template_id: e.target.value || null })}
          />
          <Button variant="ghost" size="sm" icon={<Palette size={16} aria-hidden="true" />} onClick={onManageTemplates} style={{ alignSelf: 'flex-start' }}>
            {m.manageTemplates}
          </Button>
        </div>
        {archived && <Alert tone="warning">{m.archivedNote}</Alert>}
        <Divider />
        <div className="mc-row mc-row--wrap mc-gap-8">
          <Button
            variant="secondary"
            size="sm"
            icon={archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
            onClick={onToggleArchive}
            loading={archiving}
          >
            {archived ? m.unarchive : m.archive}
          </Button>
          <Button variant="danger" size="sm" icon={<Trash2 size={16} aria-hidden="true" />} onClick={onDelete}>
            {m.delete}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Clips made for the campaign against the brief's target, the deadline, and links to the clips and to Find Video. */
export function ProgressCard({ campaign }: { campaign: Campaign }) {
  const t = useT()
  const m = t.campaign.progress
  const target = campaign.brief?.clips_target || 0
  const made = campaign.clip_count || 0
  const due = deadlineBadge(campaign.brief?.deadline)
  const id = encodeURIComponent(campaign.id)

  return (
    <Card as="section" padding="sm">
      <CardHeader size="sm" icon={<Film size={18} aria-hidden="true" />} title={m.title} />
      <div className="mc-stack">
        {target > 0 ? (
          <ProgressRow
            label={m.ofTarget(made, target)}
            value={`${Math.min(100, Math.round((made / target) * 100))}%`}
            percent={Math.min(100, (made / target) * 100)}
          />
        ) : (
          <div>
            <div className="mc-h3">{m.clips(made)}</div>
            <div className="mc-caption mc-muted">{m.noTarget}</div>
          </div>
        )}
        <div className="mc-row mc-row--wrap mc-gap-8">
          <span className="mc-caption mc-muted">{m.exported(campaign.exported_count || 0)}</span>
          {due && <DeadlineBadge badge={due} />}
        </div>
        <div className="mc-row mc-row--wrap mc-gap-8">
          <ButtonLink href={`/clips/?campaign=${id}`} variant="secondary" size="sm" icon={<Film size={16} aria-hidden="true" />}>
            {m.viewClips}
          </ButtonLink>
          <ButtonLink
            href={`/discover/?campaign=${id}`}
            variant="secondary"
            size="sm"
            icon={<Clapperboard size={16} aria-hidden="true" />}
            title={m.makeHint}
          >
            {m.makeClips}
          </ButtonLink>
        </div>
        <p className="mc-caption mc-muted">{m.versionNote}</p>
      </div>
    </Card>
  )
}

/** What the brief leaves unclear: edited like any list, copied in one go to send to the agency. */
export function QuestionsCard({ questions, onChange }: { questions: string[]; onChange: (questions: string[]) => void }) {
  const t = useT()
  const m = t.campaign.questions
  const [copying, setCopying] = useState(false)

  const copy = async () => {
    setCopying(true)
    try {
      await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join('\n'))
      toast.success(m.copied)
    } catch {
      toast.error(m.copyFailed)
    } finally {
      setCopying(false)
    }
  }

  return (
    <Card as="section" padding="sm">
      <CardHeader size="sm" icon={<MessageCircleQuestion size={18} aria-hidden="true" />} title={m.title} subtitle={m.subtitle} />
      <div className="mc-stack">
        <TagInput
          label={<span className="mc-sr-only">{m.label}</span>}
          value={questions}
          placeholder={m.placeholder}
          splitOnComma={false}
          onChange={onChange}
        />
        <div>
          <Button variant="secondary" size="sm" icon={<Copy size={16} aria-hidden="true" />} onClick={copy} loading={copying} disabled={!questions.length}>
            {m.copy}
          </Button>
        </div>
      </div>
    </Card>
  )
}
