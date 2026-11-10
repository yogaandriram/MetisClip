'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, Film, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  ConfirmModal,
  EmptyState,
  IconButton,
  PageHeader,
  ScoreBadge,
  Skeleton,
  Spinner,
  StatusBadge,
  Tabs,
  Tag,
} from '@/components/ui'
import { NoAgentState } from '@/components/NoAgentState'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Clip, type ClipStatus } from '@/lib/engine'
import { isDesktop, mediaUrl, revealInExplorer } from '@/lib/media'
import { CLIP_STATUS, errorMessage, formatClock, formatDate } from '@/lib/format'

const detailHref = (id: string) => `/clips/detail/?id=${encodeURIComponent(id)}`

type Filter = 'all' | 'ready' | 'exported' | 'working' | 'failed'

const FILTERS: { id: Filter; label: string; match: (s: ClipStatus) => boolean }[] = [
  { id: 'all', label: 'Semua', match: () => true },
  { id: 'ready', label: CLIP_STATUS.ready.label, match: (s) => s === 'ready' },
  { id: 'exported', label: CLIP_STATUS.exported.label, match: (s) => s === 'exported' },
  { id: 'working', label: CLIP_STATUS.processing.label, match: (s) => s === 'processing' || s === 'rendering' },
  { id: 'failed', label: CLIP_STATUS.failed.label, match: (s) => s === 'failed' },
]

const GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }
const CENTER: React.CSSProperties = { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }

export default function ClipsPage() {
  const { activeAgent } = useAgent()
  const { epoch, systemInfo } = useEngine()
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [toDelete, setToDelete] = useState<Clip | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const load = useCallback(async (agentId: string) => {
    try {
      const { clips } = await api.clips.list({ agent_id: agentId })
      setClips(clips)
      setError(null)
    } catch (err) {
      setError(errorMessage(err, 'Gagal memuat clip'))
    }
  }, [])

  useEffect(() => {
    setClips(null)
    if (activeAgent) load(activeAgent.id)
  }, [activeAgent, load, epoch])

  const refreshOne = useCallback(async (id: string) => {
    try {
      const { clip } = await api.clips.get(id)
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
    if (!activeAgent) return
    if (e.type === 'clip.created' && e.agent_id === activeAgent.id) refreshOne(e.id)
    else if (e.type === 'clip.updated' && clips?.some((c) => c.id === e.id)) refreshOne(e.id)
    else if (e.type === 'clip.deleted') setClips((prev) => prev?.filter((c) => c.id !== e.id) ?? prev)
  })

  const remove = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await api.clips.remove(toDelete.id, true)
      setClips((prev) => prev?.filter((c) => c.id !== toDelete.id) ?? prev)
      toast.success('Clip dihapus')
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
      if (!ok) toast.error(rel ? 'Hanya tersedia di aplikasi desktop' : 'File video belum tersedia')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const exportTo = async (clip: Clip) => {
    if (!window.metis) return
    const dir = await window.metis.selectFolder({ title: 'Ekspor clip ke folder', defaultPath: systemInfo?.export_dir })
    if (!dir) return
    setExportingId(clip.id)
    try {
      const res = await api.clips.export([clip.id], dir)
      if (res.exported.length > 0) {
        toast.success('Clip diekspor')
        window.metis.showItemInFolder(res.exported[0].path)
      } else {
        toast.error(res.skipped[0]?.reason || 'Clip belum bisa diekspor')
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExportingId(null)
    }
  }

  if (!activeAgent) {
    return (
      <div>
        <PageHeader title="Hasil Pemotongan Clip" />
        <NoAgentState what="galeri clip" />
      </div>
    )
  }

  const desktop = isDesktop()
  const activeFilter = FILTERS.find((f) => f.id === filter) || FILTERS[0]
  const visible = clips?.filter((c) => activeFilter.match(c.status)) ?? []

  return (
    <div>
      <PageHeader title="Hasil Pemotongan Clip" subtitle="Klik salah satu clip untuk membuka editor subtitle." />

      {error && (
        <Alert
          tone="error"
          style={{ marginBottom: 20 }}
          action={
            <Button variant="secondary" size="sm" onClick={() => load(activeAgent.id)}>
              Coba lagi
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
          title="Belum ada clip"
          description="Clip yang dihasilkan AI akan muncul di sini secara otomatis. Mulai dari menu Cari Video."
          action={
            <ButtonLink href="/discover/" variant="accent" size="sm" icon={<Plus size={16} aria-hidden="true" />}>
              Klip baru
            </ButtonLink>
          }
        />
      ) : (
        <div className="mc-stack mc-gap-20">
          <div>
            <Tabs
              ariaLabel="Filter status clip"
              onCanvas
              tabs={FILTERS.map((f) => ({
                id: f.id,
                label: (
                  <>
                    {f.label} <span className="mc-mono">{clips.filter((c) => f.match(c.status)).length}</span>
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
              title="Tidak ada clip dengan status ini"
              description={`Belum ada clip berstatus "${activeFilter.label}" untuk workspace ini.`}
              action={
                <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                  Tampilkan semua
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
                      aria-label={`Buka editor: ${hook} (skor viral ${score}, ${CLIP_STATUS[clip.status]?.label ?? clip.status}, durasi ${clock})`}
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
                        <ScoreBadge score={clip.viral_score} size="sm" />
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
                        Edit
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
                          Ekspor
                        </Button>
                      )}
                      <span className="mc-grow" />
                      {desktop && <IconButton size="sm" variant="outline" label="Buka di Explorer" icon={<FolderOpen size={16} />} onClick={() => reveal(clip)} />}
                      <IconButton size="sm" variant="outline" label="Hapus clip" tooltip="end" icon={<Trash2 size={16} />} onClick={() => setToDelete(clip)} />
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
        title="Hapus clip ini?"
        message="Clip beserta file videonya (mentah & hasil render) akan dihapus permanen dari folder data. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus permanen"
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}
