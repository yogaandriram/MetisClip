'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, FileVideo, Link as LinkIcon, ListChecks, RotateCcw, Trash2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Alert,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  IconButton,
  PageHeader,
  PipelineSteps,
  ProgressBar,
  Skeleton,
  StatusBadge,
  ToggleSwitch,
  type StepState,
} from '@/components/ui'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Job, type JobStatus, type JobStep } from '@/lib/engine'
import { ACTIVE_JOB_STATUSES, RESUMABLE_JOB_STATUSES, errorMessage, formatDateTime, jobSource, jobStepLabel } from '@/lib/format'

type PendingAction = { kind: 'cancel' | 'delete'; job: Job } | null

/** Discovery → Analisis → Proses (DESIGN.md §8.9). */
const STEPS: { id: JobStep; label: string }[] = [
  { id: 'discovery', label: 'Discovery' },
  { id: 'analysis', label: 'Analisis' },
  { id: 'processing', label: 'Proses' },
]

const NEEDS_ATTENTION: JobStatus[] = ['failed', 'interrupted']

function pipelineSteps(job: Job): { id: string; label: string; state: StepState }[] {
  if (job.status === 'completed') return STEPS.map((s) => ({ ...s, state: 'done' }))
  const current = job.current_step ? STEPS.findIndex((s) => s.id === job.current_step) : job.status === 'failed' ? 0 : -1
  return STEPS.map((s, i) => {
    let state: StepState = 'todo'
    if (i < current) state = 'done'
    else if (i === current) {
      if (job.status === 'running') state = 'active'
      else if (job.status === 'failed') state = 'failed'
    }
    return { ...s, state }
  })
}

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

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name || 'Workspace terhapus'
  const openDetail = (job: Job) => router.push(`/discover/?job=${encodeURIComponent(job.id)}`)

  const meta = (job: Job) => (
    <>
      {allAgents && `${agentName(job.agent_id)} · `}
      {job.config.clip_duration} detik · maks. {job.config.max_clips_per_video || '∞'} klip · dibuat {formatDateTime(job.created_at)}
    </>
  )

  const sourceTitle = (job: Job) => {
    const source = jobSource(job)
    return (
      <div className="mc-row mc-gap-8">
        {source.kind === 'file' ? <FileVideo size={16} aria-hidden="true" /> : <LinkIcon size={16} aria-hidden="true" />}
        <span className="mc-label mc-truncate" title={job.source.local_file_path || job.source.youtube_url || undefined}>
          <span className="mc-sr-only">{source.label}: </span>
          {source.text}
        </span>
      </div>
    )
  }

  const attention = jobs?.filter((j) => NEEDS_ATTENTION.includes(j.status)) ?? []
  const running = jobs?.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status)) ?? []
  const finished = jobs?.filter((j) => !NEEDS_ATTENTION.includes(j.status) && !ACTIVE_JOB_STATUSES.includes(j.status)) ?? []

  return (
    <>
      <PageHeader
        title="Antrian Job"
        subtitle="Semua proses analisis dan pemotongan. Job yang terputus (misalnya karena aplikasi ditutup) bisa dilanjutkan dari checkpoint terakhir."
        actions={<ToggleSwitch checked={allAgents} onChange={setAllAgents} label="Semua workspace" />}
      />

      <div className="mc-stack mc-gap-32">
        {error && (
          <Alert
            tone="error"
            action={
              <Button variant="secondary" size="sm" onClick={load}>
                Coba lagi
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {jobs === null ? (
          <div className="mc-stack">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={120} radius="lg" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState icon={ListChecks} title="Antrian kosong" description="Belum ada job. Tempel link YouTube atau upload video di menu Cari Video." />
        ) : (
          <>
            {attention.length > 0 && (
              <section className="mc-stack" aria-labelledby="jobs-attention">
                <h2 id="jobs-attention" className="mc-h3">
                  Perlu tindakan <span className="mc-mono mc-muted">{attention.length}</span>
                </h2>
                {attention.map((job) => {
                  const lastError = job.errors[job.errors.length - 1]
                  return (
                    <Card key={job.id} as="article">
                      <div className="mc-stack">
                        <div className="mc-row mc-row--between mc-row--top mc-row--wrap mc-gap-16">
                          <div className="mc-grow mc-stack mc-gap-4">
                            <div className="mc-row mc-gap-12">
                              {sourceTitle(job)}
                              <StatusBadge kind="job" status={job.status} size="sm" />
                            </div>
                            <div className="mc-caption mc-muted">{meta(job)}</div>
                          </div>
                          <div className="mc-row mc-row--wrap mc-gap-8">
                            <Button variant="primary" size="sm" icon={<RotateCcw size={16} />} onClick={() => resume(job)} loading={busyId === job.id}>
                              Lanjutkan
                            </Button>
                            <Button variant="secondary" size="sm" icon={<Eye size={16} />} onClick={() => openDetail(job)}>
                              Detail
                            </Button>
                            <Button variant="danger" size="sm" icon={<Trash2 size={16} />} onClick={() => setPending({ kind: 'delete', job })} disabled={busyId === job.id}>
                              Hapus job
                            </Button>
                          </div>
                        </div>
                        <PipelineSteps steps={pipelineSteps(job)} />
                        {job.status === 'interrupted' && job.current_step && (
                          <p className="mc-muted">Terhenti di langkah: {jobStepLabel(job.current_step)}.</p>
                        )}
                        {lastError && (
                          <Alert tone={job.status === 'failed' ? 'error' : 'warning'} style={{ wordBreak: 'break-word' }}>
                            {lastError.message}
                          </Alert>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </section>
            )}

            {running.length > 0 && (
              <section className="mc-stack" aria-labelledby="jobs-running">
                <h2 id="jobs-running" className="mc-h3">
                  Sedang berjalan <span className="mc-mono mc-muted">{running.length}</span>
                </h2>
                {running.map((job) => (
                  <Card key={job.id} as="article">
                    <div className="mc-stack">
                      <div className="mc-row mc-row--between mc-row--top mc-row--wrap mc-gap-16">
                        <div className="mc-grow mc-stack mc-gap-4">
                          <div className="mc-row mc-gap-12">
                            {sourceTitle(job)}
                            <StatusBadge kind="job" status={job.status} size="sm" />
                          </div>
                          <div className="mc-caption mc-muted">{meta(job)}</div>
                        </div>
                        <div className="mc-row mc-row--wrap mc-gap-8">
                          <Button variant="secondary" size="sm" icon={<Eye size={16} />} onClick={() => openDetail(job)}>
                            Detail
                          </Button>
                          <Button variant="danger" size="sm" icon={<XCircle size={16} />} onClick={() => setPending({ kind: 'cancel', job })} disabled={busyId === job.id}>
                            Batalkan
                          </Button>
                        </div>
                      </div>
                      <PipelineSteps steps={pipelineSteps(job)} />
                      <ProgressBar
                        value={job.progress_pct}
                        showValue
                        label={`${jobStepLabel(job.current_step)}${job.total_scenes > 0 ? ` · ${job.processed_scenes}/${job.total_scenes} klip` : ''}`}
                      />
                    </div>
                  </Card>
                ))}
              </section>
            )}

            {finished.length > 0 && (
              <section className="mc-stack" aria-labelledby="jobs-finished">
                <h2 id="jobs-finished" className="mc-h3">
                  Riwayat <span className="mc-mono mc-muted">{finished.length}</span>
                </h2>
                <Card>
                  <div className="mc-table-wrap">
                    <table className="mc-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Sumber</th>
                          {allAgents && <th>Workspace</th>}
                          <th>Pengaturan</th>
                          <th>Dibuat</th>
                          <th className="mc-num">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finished.map((job) => {
                          const lastError = job.errors[job.errors.length - 1]
                          return (
                            <tr key={job.id}>
                              <td>
                                <StatusBadge kind="job" status={job.status} size="sm" />
                              </td>
                              <td>
                                <div style={{ maxWidth: 360 }}>
                                  {sourceTitle(job)}
                                  {lastError && (
                                    <div className="mc-caption mc-muted mc-truncate" title={lastError.message}>
                                      {lastError.message}
                                    </div>
                                  )}
                                </div>
                              </td>
                              {allAgents && <td className="mc-truncate">{agentName(job.agent_id)}</td>}
                              <td className="mc-muted" style={{ whiteSpace: 'nowrap' }}>
                                {job.config.clip_duration} detik · maks. {job.config.max_clips_per_video || '∞'} klip
                              </td>
                              <td className="mc-muted" style={{ whiteSpace: 'nowrap' }}>
                                {formatDateTime(job.created_at)}
                              </td>
                              <td>
                                <div className="mc-row mc-row--end mc-gap-4">
                                  {RESUMABLE_JOB_STATUSES.includes(job.status) && (
                                    <Button variant="secondary" size="sm" icon={<RotateCcw size={16} />} onClick={() => resume(job)} loading={busyId === job.id}>
                                      Lanjutkan
                                    </Button>
                                  )}
                                  <IconButton label="Detail job" icon={<Eye size={16} />} variant="ghost" size="sm" onClick={() => openDetail(job)} />
                                  <IconButton
                                    label="Hapus job"
                                    icon={<Trash2 size={16} />}
                                    variant="ghost"
                                    size="sm"
                                    tooltip="end"
                                    onClick={() => setPending({ kind: 'delete', job })}
                                    disabled={busyId === job.id}
                                  />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={pending?.kind === 'cancel'}
        title="Batalkan job ini?"
        message="Proses akan dihentikan. Klip yang sudah selesai tetap tersimpan, dan job bisa dilanjutkan lagi nanti."
        confirmLabel="Batalkan job"
        confirmIcon={<XCircle size={16} />}
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
        confirmIcon={<Trash2 size={16} />}
        danger
        loading={!!busyId}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  )
}
