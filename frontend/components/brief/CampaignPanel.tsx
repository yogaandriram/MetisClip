'use client'

import React, { useEffect, useState } from 'react'
import { AlertTriangle, Check, ExternalLink, Megaphone } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Badge, Divider, SelectField, Skeleton } from '@/components/ui'
import { BriefChecklist } from '@/components/brief/BriefChecklist'
import { PostCopyEditor } from '@/components/brief/PostCopyEditor'
import { useEngine } from '@/contexts/EngineContext'
import { api, type BriefCheck, type Campaign, type ClipDetail } from '@/lib/engine'
import { campaignHref } from '@/lib/brief'
import { errorMessage } from '@/lib/format'
import { tm } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

/**
 * The campaign fields of a fresh GET /api/clips/{id} merged into the editor's copy. Only those fields:
 * the editor keeps its own state for the rest, and a new updated_at would reload the preview video.
 */
export function mergeBriefDetail(d: ClipDetail, fresh: ClipDetail): ClipDetail {
  const c = fresh.clip
  return {
    ...d,
    clip: {
      ...d.clip,
      campaign_id: c.campaign_id ?? null,
      brief_fit: c.brief_fit ?? null,
      brief_reason: c.brief_reason ?? '',
      post_copy: c.post_copy ?? null,
      brief_manual: c.brief_manual ?? {},
    },
    campaign: fresh.campaign ?? null,
    brief_check: fresh.brief_check ?? null,
  }
}

interface CampaignPanelProps {
  detail: ClipDetail
  /** The editor has unsaved edits: the checklist reflects the saved clip */
  dirty: boolean
  onDetail: (update: (d: ClipDetail) => ClipDetail) => void
  /** Leave the editor through its unsaved-changes prompt */
  onNavigate: (href: string) => void
}

/** The clip editor's Campaign tab: which campaign, how well the clip fits, the checklist and the post text. */
export function CampaignPanel({ detail, dirty, onDetail, onNavigate }: CampaignPanelProps) {
  const t = useT()
  const b = t.brief.panel
  const { epoch } = useEngine()
  const clip = detail.clip
  const campaign = detail.campaign ?? null
  const check = detail.brief_check ?? null
  const [library, setLibrary] = useState<Campaign[] | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [busyRule, setBusyRule] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.campaigns
      .list()
      .then(({ campaigns }) => {
        if (!cancelled) {
          setLibrary(campaigns)
          setLibraryError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setLibraryError(errorMessage(err, tm().brief.panel.loadFailed))
      })
    return () => {
      cancelled = true
    }
  }, [epoch])

  const reload = async () => {
    try {
      const fresh = await api.clips.get(clip.id)
      onDetail((d) => mergeBriefDetail(d, fresh))
    } catch {
      /* the clip was deleted meanwhile; the editor shows that on its own */
    }
  }

  const move = async (campaignId: string) => {
    const next = campaignId || null
    if (next === (clip.campaign_id ?? null)) return
    setMoving(true)
    try {
      await api.clips.setCampaign(clip.id, next)
      await reload()
      const name = library?.find((c) => c.id === next)?.name
      toast.success(next && name ? b.moved(name) : b.unlinked)
    } catch (err) {
      toast.error(errorMessage(err, b.moveFailed))
    } finally {
      setMoving(false)
    }
  }

  const toggle = async (rule: string, checked: boolean) => {
    setBusyRule(rule)
    // Shown at once; the engine's answer replaces it
    onDetail((d) =>
      d.brief_check
        ? {
            ...d,
            brief_check: {
              ...d.brief_check,
              items: d.brief_check.items.map((it) => (it.kind === 'rule' && it.params.rule === rule ? { ...it, params: { ...it.params, checked } } : it)),
            },
          }
        : d,
    )
    try {
      const res = await api.clips.setBriefManual(clip.id, rule, checked)
      onDetail((d) => ({
        ...d,
        clip: { ...d.clip, brief_manual: res.clip.brief_manual ?? {} },
        brief_check: (res.brief_check as BriefCheck | null) ?? d.brief_check,
      }))
    } catch (err) {
      toast.error(errorMessage(err, b.manualFailed))
      reload()
    } finally {
      setBusyRule(null)
    }
  }

  // Campaign choice: the active ones, plus the clip's own when it is archived
  const options = [
    { value: '', label: b.noCampaignOption },
    ...(library || [])
      .filter((c) => c.status === 'active' || c.id === clip.campaign_id)
      .map((c) => ({ value: c.id, label: c.status === 'archived' ? b.archivedOption(c.name) : c.name })),
    ...(campaign && !(library || []).some((c) => c.id === campaign.id) ? [{ value: campaign.id, label: campaign.name }] : []),
  ]

  const fit = clip.brief_fit
  const summary = check?.summary
  const fitLevel = fit == null ? 'low' : fit >= 80 ? 'high' : fit >= 60 ? 'mid' : 'low'

  return (
    <div className="mc-stack mc-gap-20">
      <div className="mc-stack mc-gap-8">
        {library === null && !libraryError ? (
          <Skeleton height={44} radius="full" />
        ) : (
          <SelectField
            label={b.select}
            value={clip.campaign_id || ''}
            options={options}
            disabled={moving}
            onChange={(e) => move(e.target.value)}
          />
        )}
        {libraryError && <Alert tone="error">{libraryError}</Alert>}
        {campaign && (
          <div className="mc-row mc-row--between mc-row--wrap mc-gap-8 mc-caption">
            <span className="mc-muted">
              {campaign.client ? `${campaign.client} · ` : ''}
              {b.version(campaign.version)}
            </span>
            <button type="button" className="mc-link mc-row mc-gap-4" onClick={() => onNavigate(campaignHref(campaign.id))}>
              {b.openCampaign} <ExternalLink size={12} aria-hidden="true" />
            </button>
          </div>
        )}
        {campaign?.status === 'archived' && <p className="mc-caption mc-muted">{b.archivedNote}</p>}
      </div>

      {!campaign ? (
        <div className="mc-brief-none">
          <Megaphone size={20} aria-hidden="true" />
          <div className="mc-stack mc-gap-4">
            <span className="mc-label">{b.noCampaignTitle}</span>
            <span className="mc-caption mc-muted">{library && library.length === 0 ? b.noCampaigns : b.noCampaignBody}</span>
          </div>
        </div>
      ) : (
        <>
          <section className="mc-stack mc-gap-12" aria-label={b.fit}>
            <div className="mc-row mc-gap-12">
              {fit != null ? (
                <span className={`mc-score mc-score--${fitLevel}`} role="img" aria-label={b.fitAria(Math.round(fit))}>
                  {Math.round(fit)}
                </span>
              ) : null}
              <div className="mc-stack mc-gap-4 mc-grow">
                <span className="mc-label">{b.fit}</span>
                <span className="mc-caption mc-muted">{fit != null ? clip.brief_reason || '' : b.fitNone}</span>
              </div>
            </div>
            {summary && (
              <div className="mc-stack mc-gap-8">
                <div className="mc-row mc-row--wrap mc-gap-8">
                  {summary.ready ? (
                    <Badge tone="success" size="sm" icon={<Check size={14} aria-hidden="true" />}>
                      {b.ready}
                    </Badge>
                  ) : (
                    <Badge tone="error" size="sm" icon={<AlertTriangle size={14} aria-hidden="true" />}>
                      {b.notReady}
                    </Badge>
                  )}
                </div>
                <span className="mc-caption mc-muted">{b.summary(summary.ok, summary.fail, summary.manual_open)}</span>
              </div>
            )}
            {dirty && <p className="mc-caption mc-brief-stale">{b.stale}</p>}
          </section>

          <section className="mc-stack mc-gap-12" aria-labelledby="brief-checklist-title">
            <h3 id="brief-checklist-title" className="mc-body-lg mc-label">
              {b.checklist}
            </h3>
            {check ? <BriefChecklist items={check.items} onToggle={toggle} busyRule={busyRule} /> : <Skeleton height={120} radius="md" />}
          </section>

          <Divider />

          <section className="mc-stack mc-gap-12" aria-labelledby="brief-post-title">
            <div className="mc-stack mc-gap-4">
              <h3 id="brief-post-title" className="mc-body-lg mc-label">
                {t.brief.post.title}
              </h3>
              <p className="mc-caption mc-muted">{t.brief.post.hint}</p>
            </div>
            <PostCopyEditor clip={clip} onSaved={reload} />
          </section>
        </>
      )}
    </div>
  )
}

export default CampaignPanel
