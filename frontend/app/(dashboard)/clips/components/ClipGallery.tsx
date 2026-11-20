'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, Film, FolderOpen, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  ConfirmModal,
  EmptyState,
  IconButton,
  ScoreBadge,
  Skeleton,
  Spinner,
  StatusBadge,
  Tabs,
  Tag,
} from '@/components/ui'
import { BriefBadge } from '@/components/brief/BriefBadge'
import { useCampaign } from '@/contexts/CampaignContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, eventForCampaign, type Clip, type ClipDetail, type ClipStatus } from '@/lib/engine'
import { isDesktop, mediaUrl, revealInExplorer } from '@/lib/media'
import { CLIP_STATUS, errorMessage, formatClock, formatDate } from '@/lib/format'
import { tm } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

const detailHref = (id: string) => `/clips/detail/?id=${encodeURIComponent(id)}`

type Filter = 'all' | 'ready' | 'exported' | 'working' | 'failed'

/** `status` names the filter with that status's label (null = "Semua"), read at render time. */
const FILTERS: { id: Filter; status: ClipStatus | null; match: (s: ClipStatus) => boolean }[] = [
  { id: 'all', status: null, match: () => true },
  { id: 'ready', status: 'ready', match: (s) => s === 'ready' },
  { id: 'exported', status: 'exported', match: (s) => s === 'exported' },
  { id: 'working', status: 'processing', match: (s) => s === 'processing' || s === 'rendering' },
  { id: 'failed', status: 'failed', match: (s) => s === 'failed' },
]

const filterLabel = (status: ClipStatus | null) => (status ? CLIP_STATUS[status].label : tm().common.all)

/** A clip from GET /api/clips/{id}, with the campaign fields only the list carries. */
const fromDetail = (d: ClipDetail): Clip => ({
  ...d.clip,
  campaign_name: d.campaign?.name ?? d.clip.campaign_name,
  brief_summary: d.brief_check?.summary ?? null,
})

const GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }
const CENTER: React.CSSProperties = { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }

/**
 * The Clip tab of Hasil Clip: the gallery of one campaign (`campaignId`) or of every campaign
 * (undefined), filtered by status.
 */
export function ClipGallery({ campaignId }: { campaignId: string | undefined }) {
  const { campaigns } = useCampaign()
  const { epoch, systemInfo } = useEngine()
  const t = useT()
  const m = t.clips
  const allCampaigns = !campaignId
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [toDelete, setToDelete] = useState<Clip | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const load = useCallback(async (id: string | undefined) => {
    try {
      const { clips } = await api.clips.list({ campaign_id: id })
      setClips(clips)
      setError(null)
    } catch (err) {
      setError(errorMessage(err, tm().clips.loadFailed))
    }
  }, [])

  useEffect(() => {
    setClips(null)
    load(campaignId)
  }, [campaignId, load, epoch])

  const refreshOne = useCallback(async (id: string) => {
    try {
      const clip = fromDetail(await api.clips.get(id))
      setClips((prev) => {
        if (!prev) return prev
        const exists = prev.some((c) => c.id === id)
        if (!exists) return [clip, ...prev]
        return prev.map((c) => (c.id === id ? clip : c))
      })
    } catch {
      /* deleted meanwhile */
    }
  }, [])

  useEngineEvents((e) => {
    if (e.type === 'clip.created' && (!campaignId || eventForCampaign(e, campaignId))) refreshOne(e.id)
    else if (e.type === 'clip.updated' && clips?.some((c) => c.id === e.id)) refreshOne(e.id)
    else if (e.type === 'clip.deleted') setClips((prev) => prev?.filter((c) => c.id !== e.id) ?? prev)
  })

  const remove = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await api.clips.remove(toDelete.id, true)
      setClips((prev) => prev?.filter((c) => c.id !== toDelete.id) ?? prev)
      toast.success(m.deleted)
      setToDelete(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const reveal = async (clip: Clip) => {
    const rel = clip.files.final || clip.files.raw
    try {
      const ok = await revealInExplorer(systemInfo?.data_root, rel)
      if (!ok) toast.error(rel ? m.desktopOnly : m.noVideoFile)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const exportTo = async (clip: Clip) => {
    if (!window.metis) return
    const dir = await window.metis.selectFolder({ title: m.exportDialogTitle, defaultPath: systemInfo?.export_dir })
    if (!dir) return
    setExportingId(clip.id)
    try {
      const res = await api.clips.export([clip.id], dir)
      if (res.exported.length > 0) {
        toast.success(m.exported)
        window.metis.showItemInFolder(res.exported[0].path)
      } else {
        toast.error(res.skipped[0]?.reason || m.cannotExport)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExportingId(null)
    }
  }

  const desktop = isDesktop()
  const activeFilter = FILTERS.find((f) => f.id === filter) || FILTERS[0]
  const all = clips ?? []
  const visible = all.filter((c) => activeFilter.match(c.status))
  const campaignName = (clip: Clip) => clip.campaign_name || campaigns.find((c) => c.id === clip.campaign_id)?.name || t.brief.campaign

  return (
    <div>
      {error && (
        <Alert
          tone="error"
          style={{ marginBottom: 20 }}
          action={
            <Button variant="secondary" size="sm" onClick={() => load(campaignId)}>
              {t.common.retry}
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {clips === null ? (
        <div style={GRID}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mc-stack mc-gap-12">
              <Skeleton height="auto" radius="md" style={{ aspectRatio: '9 / 16' }} />
              <Skeleton height={18} width="70%" />
              <Skeleton height={14} width="90%" />
            </div>
          ))}
        </div>
      ) : clips.length === 0 ? (
        <EmptyState
          icon={Film}
          title={m.emptyTitle}
          description={m.emptyDescription}
          action={
            <ButtonLink href="/discover/" variant="accent" size="sm" icon={<Plus size={16} aria-hidden="true" />}>
              {m.newClip}
            </ButtonLink>
          }
        />
      ) : (
        <div className="mc-stack mc-gap-20">
          <div>
            <Tabs
              ariaLabel={m.filterAria}
              size="sm"
              onCanvas
              tabs={FILTERS.map((f) => ({
                id: f.id,
                label: (
                  <>
                    {filterLabel(f.status)} <span className="mc-mono">{all.filter((c) => f.match(c.status)).length}</span>
                  </>
                ),
              }))}
              activeTab={filter}
              onChange={(id) => setFilter(id as Filter)}
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Film}
              title={m.noneWithStatus}
              description={m.noneWithStatusDescription(filterLabel(activeFilter.status))}
              action={
                <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                  {m.showAll}
                </Button>
              }
            />
          ) : (
            <div style={GRID}>
              {visible.map((clip) => {
                const ready = !!clip.files.raw && clip.status !== 'processing'
                const hook = clip.hook_text || 'MetisClip'
                const score = Math.round(clip.viral_score)
                const clock = formatClock(clip.duration_seconds)
                return (
                  <article key={clip.id} className="mc-stack mc-gap-12">
                    <Link
                      href={detailHref(clip.id)}
                      className="mc-thumb mc-on-ink mc-card--interactive"
                      style={{ display: 'block', aspectRatio: '9 / 16', textDecoration: 'none' }}
                      aria-label={m.openEditor(hook, score, CLIP_STATUS[clip.status]?.label ?? clip.status, clock)}
                    >
                      {clip.files.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl(clip.id, 'thumbnail', clip.updated_at)} alt="" loading="lazy" style={{ position: 'absolute', inset: 0 }} />
                      ) : (
                        <span style={{ ...CENTER, color: 'var(--on-ink-muted)' }} aria-hidden="true">
                          {ready ? <Film size={24} /> : <Spinner size="lg" />}
                        </span>
                      )}
                      <span className="mc-thumb__corner mc-thumb__corner--tl">
                        <ScoreBadge score={clip.viral_score} size="sm" manual={clip.origin === 'manual'} />
                      </span>
                      <span className="mc-thumb__corner mc-thumb__corner--tr">
                        <StatusBadge kind="clip" status={clip.status} size="sm" />
                      </span>
                      <span className="mc-thumb__corner mc-thumb__corner--br">
                        <Badge tone="ink" size="sm">
                          <span className="mc-mono">{clock}</span>
                        </Badge>
                      </span>
                    </Link>

                    <div className="mc-stack mc-gap-4">
                      <h2 className="mc-h3 mc-clamp-2" title={hook}>
                        {hook}
                      </h2>
                      <span className="mc-caption mc-muted">{formatDate(clip.created_at)}</span>
                    </div>
                    {((allCampaigns && clip.campaign_id) || clip.brief_summary) && (
                      <div className="mc-row mc-row--wrap mc-gap-4">
                        {allCampaigns && clip.campaign_id && (
                          <Tag>
                            <Megaphone size={12} aria-hidden="true" />
                            <span className="mc-sr-only">{t.brief.campaign}: </span>
                            <span className="mc-truncate" style={{ maxWidth: 160 }} title={campaignName(clip)}>
                              {campaignName(clip)}
                            </span>
                          </Tag>
                        )}
                        {clip.brief_summary && (
                          <Link href={`${detailHref(clip.id)}&tab=brief`} className="mc-brief-badge-link">
                            <BriefBadge summary={clip.brief_summary} />
                          </Link>
                        )}
                      </div>
                    )}
                    {clip.rationale && (
                      <p className="mc-muted mc-clamp-2" title={clip.rationale}>
                        {clip.rationale}
                      </p>
                    )}
                    {clip.tags.length > 0 && (
                      <div className="mc-row mc-row--wrap mc-gap-4">
                        {clip.tags.map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </div>
                    )}

                    <div className="mc-row mc-row--wrap mc-gap-8" style={{ marginTop: 'auto' }}>
                      <ButtonLink href={detailHref(clip.id)} variant="secondary" size="sm" icon={<Pencil size={16} aria-hidden="true" />}>
                        {m.edit}
                      </ButtonLink>
                      {desktop && clip.files.final && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Download size={16} aria-hidden="true" />}
                          loading={exportingId === clip.id}
                          disabled={exportingId === clip.id}
                          onClick={() => exportTo(clip)}
                        >
                          {m.export}
                        </Button>
                      )}
                      <span className="mc-grow" />
                      {desktop && <IconButton size="sm" variant="outline" label={t.common.openInExplorer} icon={<FolderOpen size={16} />} onClick={() => reveal(clip)} />}
                      <IconButton size="sm" variant="outline" label={m.delete} tooltip="end" icon={<Trash2 size={16} />} onClick={() => setToDelete(clip)} />
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        title={m.deleteModal.title}
        message={m.deleteModal.message}
        confirmLabel={m.deleteModal.confirm}
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}
