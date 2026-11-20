'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, CheckSquare, Clapperboard, Download, Film, FolderOpen, Megaphone, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmModal,
  EmptyState,
  IconButton,
  InputField,
  ScoreBadge,
  SelectField,
  Skeleton,
  Spinner,
  StatusBadge,
  Tabs,
  Tag,
  Tooltip,
} from '@/components/ui'
import { BriefBadge } from '@/components/brief/BriefBadge'
import { useCampaign } from '@/contexts/CampaignContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { cx } from '@/lib/cx'
import { api, eventForCampaign, type Clip, type ClipDetail, type ClipStatus } from '@/lib/engine'
import { isDesktop, mediaUrl, revealInExplorer } from '@/lib/media'
import { CLIP_STATUS, errorMessage, formatClock, formatDate } from '@/lib/format'
import { tm } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

const detailHref = (id: string) => `/clips/detail/?id=${encodeURIComponent(id)}`

type Filter = 'all' | 'ready' | 'exported' | 'working' | 'failed'
type Sort = 'newest' | 'oldest' | 'score'

/** `status` names the filter with that status's label (null = "Semua"), read at render time. */
const FILTERS: { id: Filter; status: ClipStatus | null; match: (s: ClipStatus) => boolean }[] = [
  { id: 'all', status: null, match: () => true },
  { id: 'ready', status: 'ready', match: (s) => s === 'ready' },
  { id: 'exported', status: 'exported', match: (s) => s === 'exported' },
  { id: 'working', status: 'processing', match: (s) => s === 'processing' || s === 'rendering' },
  { id: 'failed', status: 'failed', match: (s) => s === 'failed' },
]

const filterLabel = (status: ClipStatus | null) => (status ? CLIP_STATUS[status].label : tm().common.all)

/** Cards per page; "Tampilkan lagi" adds the next ones */
const PAGE = 48

/** A clip from GET /api/clips/{id}, with the fields only the list carries. */
const fromDetail = (d: ClipDetail): Clip => ({
  ...d.clip,
  campaign_name: d.campaign?.name ?? d.clip.campaign_name,
  brief_summary: d.brief_check?.summary ?? null,
  source_title: d.source_video?.title ?? d.clip.source_title,
})

/** Lower case without accents, so "kopi" finds "Kopí" */
const fold = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const newestFirst = (a: Clip, b: Clip) => (b.created_at || '').localeCompare(a.created_at || '')
const SORTS: Record<Sort, (a: Clip, b: Clip) => number> = {
  newest: newestFirst,
  oldest: (a, b) => -newestFirst(a, b),
  // Clips the user chose themselves have no score: they come last
  score: (a, b) => (b.origin === 'manual' ? -1 : b.viral_score) - (a.origin === 'manual' ? -1 : a.viral_score) || newestFirst(a, b),
}

const GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }
const CENTER: React.CSSProperties = { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }

interface ClipGalleryProps {
  /** One campaign's clips, or every campaign's (undefined) */
  campaignId: string | undefined
  /** Only the clips of this job (`?job=` in the URL) */
  jobId: string | null
  onJobChange: (jobId: string | null) => void
}

/**
 * The Clip tab of Hasil Clip: the gallery of one campaign or of every campaign, with search, sort, a job
 * filter, the status tabs, pages of cards, and a selection mode for rendering, copying or deleting many clips.
 */
export function ClipGallery({ campaignId, jobId, onJobChange }: ClipGalleryProps) {
  const { campaigns } = useCampaign()
  const { epoch, systemInfo } = useEngine()
  const t = useT()
  const m = t.clips
  const tb = m.toolbar
  const allCampaigns = !campaignId
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [shown, setShown] = useState(PAGE)
  const [toDelete, setToDelete] = useState<Clip | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)
  // Selection mode
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [bulk, setBulk] = useState<'render' | 'delete' | null>(null)
  const [renderAgain, setRenderAgain] = useState(false)
  const [bulkBusy, setBulkBusy] = useState<'render' | 'copy' | 'delete' | null>(null)

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

  // A new search, sort or filter starts at the first page
  useEffect(() => setShown(PAGE), [query, sort, filter, jobId, campaignId])

  const exitSelecting = useCallback(() => {
    setSelecting(false)
    setSelected(new Set())
  }, [])

  useEffect(() => {
    if (!selecting || bulk || toDelete) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelecting()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, bulk, toDelete, exitSelecting])

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
  const all = useMemo(() => clips ?? [], [clips])
  const campaignName = useCallback(
    (clip: Clip) => clip.campaign_name || campaigns.find((c) => c.id === clip.campaign_id)?.name || tm().brief.campaign,
    [campaigns],
  )

  // Search and job filter first (the status tabs count within them), then the status, then the sort
  const terms = useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query])
  const matching = useMemo(
    () =>
      all.filter((c) => {
        if (jobId && c.job_id !== jobId) return false
        if (!terms.length) return true
        const text = fold([c.hook_text, c.rationale, c.tags.join(' '), campaignName(c), c.source_title || ''].join(' '))
        return terms.every((term) => text.includes(term))
      }),
    [all, jobId, terms, campaignName],
  )
  const activeFilter = FILTERS.find((f) => f.id === filter) || FILTERS[0]
  const visible = useMemo(() => matching.filter((c) => activeFilter.match(c.status)).sort(SORTS[sort]), [matching, activeFilter, sort])
  const page = visible.slice(0, shown)

  // The jobs that made these clips, newest first, for the job filter
  const jobOptions = useMemo(() => {
    const byJob = new Map<string, { title: string; created: string; n: number }>()
    for (const c of all) {
      if (!c.job_id) continue
      const entry = byJob.get(c.job_id)
      if (!entry) byJob.set(c.job_id, { title: c.source_title || '', created: c.created_at, n: 1 })
      else {
        entry.n += 1
        if (c.created_at < entry.created) entry.created = c.created_at
        if (!entry.title && c.source_title) entry.title = c.source_title
      }
    }
    if (jobId && !byJob.has(jobId)) byJob.set(jobId, { title: '', created: '', n: 0 })
    return Array.from(byJob.entries())
      .sort((a, b) => b[1].created.localeCompare(a[1].created))
      .map(([id, j]) => ({ value: id, label: tb.jobOption(j.title || tb.untitled, j.created ? formatDate(j.created) : '–', j.n) }))
  }, [all, jobId, tb])

  // Selection: only clips that still exist count
  const picked = all.filter((c) => selected.has(c.id))
  const renderable = picked.filter((c) => c.files.raw && c.status !== 'processing' && c.status !== 'rendering')
  // Clips with a final video render again only when edited since; the others are copied again (reuse)
  const toRender = renderable
  const withFinal = picked.filter((c) => c.files.final)
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const startBulkRender = async () => {
    setBulkBusy('render')
    try {
      const res = await api.clips.renderMany(
        toRender.map((c) => c.id),
        { reuse: !renderAgain },
      )
      const copied = res.render_jobs.filter((j) => j.reused).length
      const queued = res.render_jobs.length - copied
      if (queued) toast.success(m.bulkRender.started(queued))
      if (copied) toast.success(m.bulkRender.copied(copied))
      if (res.skipped.length) toast.error(m.bulkRender.skipped(res.skipped.length, res.skipped[0].reason))
      setBulk(null)
      // Nothing queued: keep the selection, so the user can fix the reason and try again
      if (res.render_jobs.length) exitSelecting()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBulkBusy(null)
    }
  }

  const bulkCopy = async () => {
    if (!window.metis) return
    if (withFinal.length === 0) {
      toast.error(m.bulkCopy.none)
      return
    }
    const dir = await window.metis.selectFolder({ title: m.bulkCopy.dialogTitle(withFinal.length), defaultPath: systemInfo?.export_dir })
    if (!dir) return
    setBulkBusy('copy')
    try {
      const res = await api.clips.export(
        withFinal.map((c) => c.id),
        dir,
      )
      if (res.exported.length) {
        toast.success(m.bulkCopy.done(res.exported.length))
        window.metis.showItemInFolder(res.exported[0].path)
      }
      if (res.skipped.length) toast.error(m.bulkCopy.skipped(res.skipped.length, res.skipped[0].reason))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBulkBusy(null)
    }
  }

  const bulkDelete = async () => {
    setBulkBusy('delete')
    try {
      const res = await api.clips.removeMany(picked.map((c) => c.id))
      const gone = new Set([...res.deleted, ...res.missing])
      setClips((prev) => prev?.filter((c) => !gone.has(c.id)) ?? prev)
      toast.success(m.bulkDelete.done(res.deleted.length))
      setBulk(null)
      exitSelecting()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBulkBusy(null)
    }
  }

  const resetFilters = () => {
    setQuery('')
    setFilter('all')
    if (jobId) onJobChange(null)
  }

  const thumbInner = (clip: Clip, mark: React.ReactNode) => {
    const ready = !!clip.files.raw && clip.status !== 'processing'
    return (
      <>
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
        {mark}
        <span className="mc-thumb__corner mc-thumb__corner--br">
          <Badge tone="ink" size="sm">
            <span className="mc-mono">{formatClock(clip.duration_seconds)}</span>
          </Badge>
        </span>
      </>
    )
  }

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
      ) : clips.length === 0 && !jobId ? (
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
          <div className="mc-gallery-tools">
            <InputField
              containerClassName="mc-gallery-tools__search"
              aria-label={tb.search}
              placeholder={tb.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              icon={<Search size={18} aria-hidden="true" />}
              inputSize="sm"
              action={
                query ? <IconButton size="sm" variant="ghost" label={tb.clearSearch} icon={<X size={16} />} onClick={() => setQuery('')} /> : undefined
              }
            />
            <SelectField
              aria-label={tb.sort}
              containerClassName="mc-gallery-tools__sort"
              inputSize="sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              options={[
                { value: 'newest', label: tb.sortNewest },
                { value: 'oldest', label: tb.sortOldest },
                { value: 'score', label: tb.sortScore },
              ]}
            />
            {(jobOptions.length > 1 || jobId) && (
              <SelectField
                aria-label={tb.job}
                containerClassName="mc-gallery-tools__job"
                inputSize="sm"
                value={jobId || ''}
                onChange={(e) => onJobChange(e.target.value || null)}
                options={[{ value: '', label: tb.allJobs }, ...jobOptions]}
              />
            )}
            {!selecting && (
              <Button variant="secondary" size="sm" icon={<CheckSquare size={16} aria-hidden="true" />} onClick={() => setSelecting(true)}>
                {tb.select}
              </Button>
            )}
          </div>

          <div>
            <Tabs
              ariaLabel={m.filterAria}
              size="sm"
              onCanvas
              tabs={FILTERS.map((f) => ({
                id: f.id,
                label: (
                  <>
                    {filterLabel(f.status)} <span className="mc-mono">{matching.filter((c) => f.match(c.status)).length}</span>
                  </>
                ),
              }))}
              activeTab={filter}
              onChange={(id) => setFilter(id as Filter)}
            />
          </div>

          {matching.length === 0 ? (
            <EmptyState
              icon={Search}
              title={m.noMatch}
              description={m.noMatchDescription}
              action={
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  {m.resetFilters}
                </Button>
              }
            />
          ) : visible.length === 0 ? (
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
            <>
              <div style={GRID}>
                {page.map((clip) => {
                  const hook = clip.hook_text || 'MetisClip'
                  const isPicked = selected.has(clip.id)
                  return (
                    <article key={clip.id} className="mc-stack mc-gap-12">
                      {selecting ? (
                        <button
                          type="button"
                          className={cx('mc-thumb mc-on-ink mc-card--interactive mc-thumb--pickable', isPicked && 'mc-thumb--picked')}
                          style={{ aspectRatio: '9 / 16' }}
                          aria-pressed={isPicked}
                          aria-label={m.pick.toggle(hook)}
                          onClick={() => toggle(clip.id)}
                        >
                          {thumbInner(
                            clip,
                            <span className="mc-thumb__corner mc-thumb__corner--bl">
                              <span className="mc-pick-mark" aria-hidden="true">
                                {isPicked && <Check size={16} />}
                              </span>
                            </span>,
                          )}
                        </button>
                      ) : (
                        <Link
                          href={detailHref(clip.id)}
                          className="mc-thumb mc-on-ink mc-card--interactive"
                          style={{ display: 'block', aspectRatio: '9 / 16', textDecoration: 'none' }}
                          aria-label={m.openEditor(hook, Math.round(clip.viral_score), CLIP_STATUS[clip.status]?.label ?? clip.status, formatClock(clip.duration_seconds))}
                        >
                          {thumbInner(clip, null)}
                        </Link>
                      )}

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

              <div className="mc-row mc-row--wrap mc-gap-12" style={{ justifyContent: 'center' }}>
                <span className="mc-caption mc-muted" aria-live="polite">
                  {m.showing(page.length, visible.length)}
                </span>
                {visible.length > page.length && (
                  <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                    {m.showMore(Math.min(PAGE, visible.length - page.length))}
                  </Button>
                )}
              </div>
            </>
          )}

          {selecting && (
            <div className="mc-bulkbar">
              <Card tone="ink" padding="sm">
                <div className="mc-row mc-row--wrap mc-gap-8">
                  <span className="mc-label" aria-live="polite" style={{ paddingInline: 8 }}>
                    {m.pick.count(picked.length)}
                  </span>
                  {visible.some((c) => !selected.has(c.id)) && (
                    <Button variant="ghost" size="sm" onClick={() => setSelected((prev) => new Set(Array.from(prev).concat(visible.map((c) => c.id))))}>
                      {m.pick.all(visible.length)}
                    </Button>
                  )}
                  {picked.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                      {m.pick.none}
                    </Button>
                  )}
                  <span className="mc-grow" />
                  <Tooltip label={m.pick.renderTip}>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Clapperboard size={16} aria-hidden="true" />}
                      disabled={renderable.length === 0}
                      onClick={() => {
                        setRenderAgain(false)
                        setBulk('render')
                      }}
                    >
                      {m.pick.render(renderable.length)}
                    </Button>
                  </Tooltip>
                  {desktop && (
                    <Tooltip label={m.pick.copyTip}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Download size={16} aria-hidden="true" />}
                        disabled={withFinal.length === 0}
                        loading={bulkBusy === 'copy'}
                        onClick={bulkCopy}
                      >
                        {m.pick.copy(withFinal.length)}
                      </Button>
                    </Tooltip>
                  )}
                  <Button variant="danger" size="sm" icon={<Trash2 size={16} aria-hidden="true" />} disabled={picked.length === 0} onClick={() => setBulk('delete')}>
                    {m.pick.delete(picked.length)}
                  </Button>
                  <Button variant="ghost" size="sm" icon={<X size={16} aria-hidden="true" />} onClick={exitSelecting}>
                    {m.pick.done}
                  </Button>
                </div>
              </Card>
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

      <ConfirmModal
        isOpen={bulk === 'delete'}
        title={m.bulkDelete.title(picked.length)}
        message={m.bulkDelete.message}
        confirmLabel={m.bulkDelete.confirm}
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        danger
        loading={bulkBusy === 'delete'}
        onConfirm={bulkDelete}
        onClose={() => bulkBusy !== 'delete' && setBulk(null)}
      />

      <ConfirmModal
        isOpen={bulk === 'render'}
        title={m.bulkRender.title(toRender.length)}
        message={m.bulkRender.message(systemInfo?.export_dir || '')}
        confirmLabel={m.bulkRender.confirm}
        confirmIcon={<Clapperboard size={16} aria-hidden="true" />}
        confirmDisabled={toRender.length === 0}
        loading={bulkBusy === 'render'}
        onConfirm={startBulkRender}
        onClose={() => bulkBusy !== 'render' && setBulk(null)}
      >
        {renderable.some((c) => c.files.final) && (
          <label className="mc-row mc-row--top mc-gap-12" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={renderAgain} onChange={(e) => setRenderAgain(e.target.checked)} style={{ marginTop: 3 }} />
            <span>{m.bulkRender.again(renderable.filter((c) => c.files.final).length)}</span>
          </label>
        )}
        {toRender.length === 0 && (
          <p className="mc-caption mc-muted" role="status">
            {m.bulkRender.nothing}
          </p>
        )}
      </ConfirmModal>
    </div>
  )
}
