'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ListChecks, RotateCcw, Trash2, XCircle, Eye, Sparkles, Link as LinkIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Job } from '@/lib/engine'
import { ACTIVE_JOB_STATUSES, JOB_STATUS, RESUMABLE_JOB_STATUSES, errorMessage, formatDateTime, jobStepLabel } from '@/lib/format'

type PendingAction = { kind: 'cancel' | 'delete'; job: Job } | null

export default function JobsPage() {
  const router = useRouter()
  const { activeAgent, agents } = useAgent()
  const { epoch } = useEngine()
  const [allAgents, setAllAgents] = useState(false)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const agentFilter = allAgents ? undefined : activeAgent?.id

  const load = useCallback(async () => {
    try {
      const { jobs } = await api.jobs.list({ agent_id: agentFilter, limit: 100 })
      setJobs(jobs)
      setError(null)
    } catch (err) {
      setError(errorMessage(err, 'Gagal memuat antrian'))
    }
  }, [agentFilter])

  useEffect(() => {
    setJobs(null)
    load()
  }, [load, epoch])

  useEngineEvents((e) => {
    if (e.type === 'job.progress') {
      if (!jobs) return
      if (!jobs.some((j) => j.id === e.id)) {
        if (!agentFilter || e.agent_id === agentFilter) load()
        return
      }
      setJobs((prev) =>
        prev?.map((j) =>
          j.id === e.id ? { ...j, status: e.status, current_step: e.current_step, progress_pct: e.progress_pct, total_scenes: e.total_scenes, processed_scenes: e.processed_scenes } : j
        ) ?? prev
      )
    } else if (e.type === 'job.status') {
      if (!agentFilter || e.agent_id === agentFilter) load()
    }
  })

  const replaceJob = (job: Job) => setJobs((prev) => prev?.map((j) => (j.id === job.id ? job : j)) ?? prev)

  const resume = async (job: Job) => {
    setBusyId(job.id)
    try {
      replaceJob((await api.jobs.resume(job.id)).job)
      toast.success('Job dilanjutkan')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const confirm = async () => {
    if (!pending) return
    const { kind, job } = pending
    setBusyId(job.id)
    try {
      if (kind === 'cancel') {
        replaceJob((await api.jobs.cancel(job.id)).job)
        toast.success('Job dibatalkan')
      } else {
        await api.jobs.remove(job.id)
        setJobs((prev) => prev?.filter((j) => j.id !== job.id) ?? prev)
        toast.success('Job dihapus')
      }
      setPending(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name || 'Agent terhapus'

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        title="Antrian Job"
        subtitle="Semua proses analisis & pemotongan. Job yang terputus (misalnya karena aplikasi ditutup) bisa dilanjutkan dari checkpoint terakhir."
        actions={
          <>
            <ToggleSwitch checked={allAgents} onChange={setAllAgents} label="Semua agent" />
            <Link href="/discover/" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="sm" icon={<Sparkles size={14} />}>
                Job baru
              </Button>
            </Link>
          </>
        }
      />

      {error && (
        <GlassCard hoverEffect={false} padding="16px 20px" style={{ border: '1px solid var(--danger)', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button className="mc-link-button" onClick={load}>
            Coba lagi
          </button>
        </GlassCard>
      )}

      {jobs === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={ListChecks} title="Antrian kosong" description="Belum ada job. Tempel link YouTube di menu Cari Video." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {jobs.map((job) => {
            const s = JOB_STATUS[job.status]
            const active = ACTIVE_JOB_STATUSES.includes(job.status)
            const source = job.source.youtube_url
            const lastError = job.errors[job.errors.length - 1]
            return (
              <GlassCard key={job.id} hoverEffect={false} padding="20px">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <LinkIcon size={16} color="var(--text-muted)" />
                      <span style={{ fontWeight: 600, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '520px' }}>{source || '-'}</span>
                      <Badge variant={s.variant} glow={false}>
                        {s.label}
                      </Badge>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {allAgents && `${agentName(job.agent_id)} · `}
                      {job.config.clip_duration} detik · maks. {job.config.max_clips_per_video || '∞'} klip · dibuat {formatDateTime(job.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={() => router.push(`/discover/?job=${encodeURIComponent(job.id)}`)}>
                      Detail
                    </Button>
                    {active && (
                      <Button variant="danger" size="sm" icon={<XCircle size={14} />} onClick={() => setPending({ kind: 'cancel', job })} disabled={busyId === job.id}>
                        Batalkan
                      </Button>
                    )}
                    {RESUMABLE_JOB_STATUSES.includes(job.status) && (
                      <Button variant="primary" size="sm" icon={<RotateCcw size={14} />} onClick={() => resume(job)} loading={busyId === job.id}>
                        Lanjutkan
                      </Button>
                    )}
                    {!active && (
                      <button className="mc-icon-button" title="Hapus job" onClick={() => setPending({ kind: 'delete', job })} disabled={busyId === job.id}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {active && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                      <span>{jobStepLabel(job.current_step)}</span>
                      <span>
                        {job.total_scenes > 0 ? `${job.processed_scenes}/${job.total_scenes} klip · ` : ''}
                        {Math.round(job.progress_pct)}%
                      </span>
                    </div>
                    <ProgressBar progress={job.progress_pct} height="6px" />
                  </div>
                )}
                {!active && lastError && (
                  <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--danger)', wordBreak: 'break-word' }}>
                    {lastError.message}
                  </p>
                )}
              </GlassCard>
            )
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={pending?.kind === 'cancel'}
        title="Batalkan job ini?"
        message="Proses akan dihentikan. Klip yang sudah selesai tetap tersimpan, dan job bisa dilanjutkan lagi nanti."
        confirmLabel="Batalkan job"
        danger
        loading={!!busyId}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
      <ConfirmModal
        isOpen={pending?.kind === 'delete'}
        title="Hapus job dari antrian?"
        message="Riwayat job ini akan dihapus. Klip yang sudah dihasilkan tidak ikut terhapus."
        confirmLabel="Hapus job"
        danger
        loading={!!busyId}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </div>
  )
}
