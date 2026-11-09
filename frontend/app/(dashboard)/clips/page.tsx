'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Play, Calendar, Flame, Loader2, MoreVertical, Trash2, Edit2, FolderOpen, Film, Sparkles, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dropdown, type DropdownItem } from '@/components/ui/Dropdown'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { NoAgentState } from '@/components/NoAgentState'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Clip } from '@/lib/engine'
import { isDesktop, mediaUrl, revealInExplorer } from '@/lib/media'
import { CLIP_STATUS, errorMessage, formatClock, formatDate } from '@/lib/format'

const detailHref = (id: string) => `/clips/detail/?id=${encodeURIComponent(id)}`

export default function ClipsPage() {
  const router = useRouter()
  const { activeAgent } = useAgent()
  const { epoch, systemInfo } = useEngine()
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  return (
    <div>
      <PageHeader
        title="Hasil Pemotongan Clip"
        subtitle="Klik salah satu clip untuk membuka editor subtitle."
        actions={
          <Link href="/discover/" style={{ textDecoration: 'none' }}>
            <Button size="sm" icon={<Sparkles size={14} />}>
              Clip video baru
            </Button>
          </Link>
        }
      />

      {error && (
        <GlassCard hoverEffect={false} padding="16px 20px" style={{ border: '1px solid var(--danger)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button className="mc-link-button" onClick={() => load(activeAgent.id)}>
            Coba lagi
          </button>
        </GlassCard>
      )}

      {clips === null ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '24px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Skeleton height={420} />
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
            <Link href="/discover/" style={{ textDecoration: 'none' }}>
              <Button size="sm">Cari video</Button>
            </Link>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '24px' }}>
          {clips.map((clip) => {
            const ready = !!clip.files.raw && clip.status !== 'processing'
            const status = CLIP_STATUS[clip.status]
            const items: DropdownItem[] = [
              { id: 'edit', label: 'Edit subtitle', icon: Edit2, onClick: () => router.push(detailHref(clip.id)) },
            ]
            if (isDesktop()) {
              items.push({ id: 'reveal', label: 'Buka di Explorer', icon: FolderOpen, onClick: () => reveal(clip) })
              if (clip.files.final) items.push({ id: 'export', label: exportingId === clip.id ? 'Mengekspor…' : 'Ekspor ke…', icon: Download, onClick: () => exportTo(clip) })
            }
            items.push({ id: 'delete', label: 'Hapus clip', icon: Trash2, danger: true, onClick: () => setToDelete(clip) })

            return (
              <GlassCard
                key={clip.id}
                glow
                padding="0px"
                style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', cursor: 'pointer' }}
                onClick={() => router.push(detailHref(clip.id))}
              >
                <div style={{ position: 'relative', width: '100%', aspectRatio: '9/16', background: '#000', overflow: 'hidden' }}>
                  {clip.files.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(clip.id, 'thumbnail', clip.updated_at)}
                      alt={clip.hook_text || 'Thumbnail clip'}
                      loading="lazy"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }}
                    />
                  )}

                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      background: ready ? 'rgba(24, 86, 255, 0.9)' : 'rgba(0, 0, 0, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: ready ? '0 0 20px var(--primary-glow)' : 'none',
                    }}
                  >
                    {ready ? <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: '4px' }} /> : <Loader2 size={20} color="var(--warning)" className="animate-spin" />}
                  </div>

                  <div style={{ position: 'absolute', top: '14px', right: '14px', left: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <Badge variant="accent" glow icon={<Flame size={13} />}>
                        {Math.round(clip.viral_score)}% viral
                      </Badge>
                      {clip.status !== 'ready' && (
                        <Badge variant={status.variant} glow={false}>
                          {status.label}
                        </Badge>
                      )}
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Dropdown
                        align="right"
                        width="190px"
                        trigger={
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'rgba(0,0,0,0.6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid rgba(255,255,255,0.1)',
                              cursor: 'pointer',
                            }}
                          >
                            <MoreVertical size={16} color="#fff" />
                          </div>
                        }
                        items={items}
                      />
                    </div>
                  </div>

                  <div style={{ position: 'absolute', bottom: '10px', right: '10px', padding: '4px 8px', background: 'rgba(0,0,0,0.8)', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                    {formatClock(clip.duration_seconds)}
                  </div>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={12} />
                    {formatDate(clip.created_at)}
                  </p>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>{clip.hook_text || 'MetisClip'}</h3>
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-dim)',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      marginBottom: '14px',
                    }}
                  >
                    {clip.rationale}
                  </p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'auto' }}>
                    {clip.tags.map((tag) => (
                      <Badge key={tag} variant="muted" glow={false}>
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        title="Hapus clip ini?"
        message="Clip beserta file videonya (mentah & hasil render) akan dihapus permanen dari folder data. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus permanen"
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}
