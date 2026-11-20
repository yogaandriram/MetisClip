'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, FileVideo, Link as LinkIcon, ListChecks, Megaphone, RotateCcw, Search, Trash2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Alert,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  IconButton,
  PipelineSteps,
  ProgressBar,
  Skeleton,
  StatusBadge,
  Tag,
  type StepState,
} from '@/components/ui'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, eventForCampaign, type Job, type JobStatus, type JobStep } from '@/lib/engine'
import { ACTIVE_JOB_STATUSES, RESUMABLE_JOB_STATUSES, errorMessage, formatDateTime, jobSource, jobStepLabel } from '@/lib/format'
import { tm, type Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

type PendingAction = { kind: 'cancel' | 'delete'; job: Job } | null

/** Discovery → Analisis → Proses (DESIGN.md §8.9); short labels from the dictionary (jobs.stepShort). */
const STEPS: JobStep[] = ['discovery', 'analysis', 'processing']

const NEEDS_ATTENTION: JobStatus[] = ['failed', 'interrupted']

function pipelineSteps(t: Messages, job: Job): { id: string; label: string; state: StepState }[] {
  const label = (id: JobStep) => t.jobs.stepShort[id]
  if (job.status === 'completed') return STEPS.map((id) => ({ id, label: label(id), state: 'done' }))
  const current = job.current_step ? STEPS.indexOf(job.current_step) : job.status === 'failed' ? 0 : -1
  return STEPS.map((id, i) => {
    let state: StepState = 'todo'
    if (i < current) state = 'done'
    else if (i === current) {
      if (job.status === 'running') state = 'active'
      else if (job.status === 'failed') state = 'failed'
    }
    return { id, label: label(id), state }
  })
}

/**
 * The Antrian tab of Hasil Clip: jobs that need the user first, then running ones, then the history.
 * `campaignId` scopes it to the jobs that follow that campaign (undefined = every job).
 */
export function JobQueue({ campaignId }: { campaignId: string | undefined }) {
  const router = useRouter()
  const { epoch } = useEngine()
  const t = useT()
  const m = t.jobs
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { jobs } = await api.jobs.list({ campaign_id: campaignId, limit: 100 })
      setJobs(jobs)
      setError(null)
    } catch (err) {
      setError(errorMessage(err, tm().jobs.loadFailed))
    }
  }, [campaignId])

  useEffect(() => {
    setJobs(null)
    load()
  }, [load, epoch])

  useEngineEvents((e) => {
    if (e.type === 'job.progress') {
      if (!jobs) return
      if (!jobs.some((j) => j.id === e.id)) {
        if (!campaignId || eventForCampaign(e, campaignId)) load()
        return
      }
      setJobs((prev) =>
        prev?.map((j) =>
          j.id === e.id
            ? {
                ...j,
                status: e.status,
                current_step: e.current_step,
                progress_pct: e.progress_pct,
                total_scenes: e.total_scenes,
                processed_scenes: e.processed_scenes,
                activity: e.message ? { message: e.message, at: new Date().toISOString() } : j.activity,
              }
            : j
        ) ?? prev
      )
    } else if (e.type === 'job.status') {
      if (!campaignId || eventForCampaign(e, campaignId)) load()
    }
  })

  const replaceJob = (job: Job) => setJobs((prev) => prev?.map((j) => (j.id === job.id ? job : j)) ?? prev)

  const resume = async (job: Job) => {
    setBusyId(job.id)
    try {
      replaceJob((await api.jobs.resume(job.id)).job)
      toast.success(job.status === 'completed' ? m.retryStarted : m.resumed)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  /** "Cari klip lagi": a new job for the same video; it shows up in the running list through its events */
  const again = async (job: Job) => {
    setBusyId(job.id)
    try {
      const { job: created } = await api.jobs.again(job.id)
      setJobs((prev) => (prev && !prev.some((j) => j.id === created.id) ? [created, ...prev] : prev))
      toast.success(m.againStarted)
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
        toast.success(m.cancelled)
      } else {
        await api.jobs.remove(job.id)
        setJobs((prev) => prev?.filter((j) => j.id !== job.id) ?? prev)
        toast.success(m.deleted)
      }
      setPending(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  // A recut belongs to its clip: its editor shows the progress
  const openDetail = (job: Job) =>
    router.push(
      job.kind === 'recut' && job.recut_clip_id
        ? `/clips/detail/?id=${encodeURIComponent(job.recut_clip_id)}`
        : `/discover/?job=${encodeURIComponent(job.id)}`,
    )

  /** What the job was asked to do: the Analyzer's settings, the user's moments, or a recut */
  const settings = (job: Job) =>
    job.kind === 'recut'
      ? m.configRecut
      : job.kind === 'manual'
        ? m.configManual(job.config.manual_ranges?.length ?? 0)
        : m.config(job.config.clip_duration, job.config.max_clips_per_video)

  const meta = (job: Job) => (
    <>
      {settings(job)} · {m.createdAt(formatDateTime(job.created_at))}
    </>
  )

  /** The campaigns the job follows and its note for this video */
  const briefInfo = (job: Job) => {
    const campaigns = job.campaigns || []
    if (campaigns.length === 0 && !job.note) return null
    return (
      <div className="mc-row mc-row--wrap mc-gap-4" style={{ marginTop: 4 }}>
        {campaigns.length > 0 && <span className="mc-sr-only">{t.brief.jobs.campaigns}: </span>}
        {campaigns.map((c) => (
          <Tag key={c.id}>
            <Megaphone size={12} aria-hidden="true" />
            <span className="mc-truncate" style={{ maxWidth: 200 }} title={c.name}>
              {c.name}
            </span>
          </Tag>
        ))}
        {job.note && (
          <span className="mc-caption mc-muted mc-truncate" style={{ maxWidth: 420 }} title={job.note}>
            {t.brief.jobs.note}: {job.note}
          </span>
        )}
      </div>
    )
  }

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
      <div className="mc-stack mc-gap-32">
        {error && (
          <Alert
            tone="error"
            action={
              <Button variant="secondary" size="sm" onClick={load}>
                {t.common.retry}
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
          <EmptyState icon={ListChecks} title={m.emptyTitle} description={m.emptyDescription} />
        ) : (
          <>
            {attention.length > 0 && (
              <section className="mc-stack" aria-labelledby="jobs-attention">
                <h2 id="jobs-attention" className="mc-h3">
                  {m.needsAction} <span className="mc-mono mc-muted">{attention.length}</span>
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
                            {briefInfo(job)}
                          </div>
                          <div className="mc-row mc-row--wrap mc-gap-8">
                            <Button variant="primary" size="sm" icon={<RotateCcw size={16} />} onClick={() => resume(job)} loading={busyId === job.id}>
                              {m.resume}
                            </Button>
                            <Button variant="secondary" size="sm" icon={<Eye size={16} />} onClick={() => openDetail(job)}>
                              {job.kind === 'recut' ? m.openClip : m.detail}
                            </Button>
                            <Button variant="danger" size="sm" icon={<Trash2 size={16} />} onClick={() => setPending({ kind: 'delete', job })} disabled={busyId === job.id}>
                              {m.delete}
                            </Button>
                          </div>
                        </div>
                        <PipelineSteps steps={pipelineSteps(t, job)} />
                        {job.status === 'interrupted' && job.current_step && (
                          <p className="mc-muted">{m.stoppedAt(jobStepLabel(job.current_step))}</p>
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
                  {m.running} <span className="mc-mono mc-muted">{running.length}</span>
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
                          {briefInfo(job)}
                        </div>
                        <div className="mc-row mc-row--wrap mc-gap-8">
                          <Button variant="secondary" size="sm" icon={<Eye size={16} />} onClick={() => openDetail(job)}>
                            {job.kind === 'recut' ? m.openClip : m.detail}
                          </Button>
                          <Button variant="danger" size="sm" icon={<XCircle size={16} />} onClick={() => setPending({ kind: 'cancel', job })} disabled={busyId === job.id}>
                            {m.cancel}
                          </Button>
                        </div>
                      </div>
                      <PipelineSteps steps={pipelineSteps(t, job)} />
                      <ProgressBar
                        value={job.progress_pct}
                        showValue
                        label={`${jobStepLabel(job.current_step)}${job.total_scenes > 0 ? ` · ${m.progressClips(job.processed_scenes, job.total_scenes)}` : ''}`}
                      />
                      {job.status === 'running' && job.activity && (
                        <p className="mc-caption mc-mono mc-muted" style={{ wordBreak: 'break-word' }}>
                          <span className="mc-sr-only">{m.activity}: </span>› {job.activity.message}
                        </p>
                      )}
                    </div>
                  </Card>
                ))}
              </section>
            )}

            {finished.length > 0 && (
              <section className="mc-stack" aria-labelledby="jobs-finished">
                <h2 id="jobs-finished" className="mc-h3">
                  {m.history} <span className="mc-mono mc-muted">{finished.length}</span>
                </h2>
                <Card>
                  <div className="mc-table-wrap">
                    <table className="mc-table">
                      <thead>
                        <tr>
                          <th>{m.columns.status}</th>
                          <th>{m.columns.source}</th>
                          <th>{m.columns.settings}</th>
                          <th>{m.columns.created}</th>
                          <th className="mc-num">{m.columns.actions}</th>
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
                                  {briefInfo(job)}
                                  {lastError && (job.status !== 'completed' || job.failed_clips > 0) && (
                                    <div className="mc-caption mc-muted mc-truncate" title={lastError.message}>
                                      {lastError.message}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="mc-muted" style={{ whiteSpace: 'nowrap' }}>
                                {settings(job)}
                              </td>
                              <td className="mc-muted" style={{ whiteSpace: 'nowrap' }}>
                                {formatDateTime(job.created_at)}
                              </td>
                              <td>
                                <div className="mc-row mc-row--end mc-gap-4">
                                  {RESUMABLE_JOB_STATUSES.includes(job.status) && (
                                    <Button variant="secondary" size="sm" icon={<RotateCcw size={16} />} onClick={() => resume(job)} loading={busyId === job.id}>
                                      {m.resume}
                                    </Button>
                                  )}
                                  {job.status === 'completed' && job.failed_clips > 0 && (
                                    <Button variant="secondary" size="sm" icon={<RotateCcw size={16} />} onClick={() => resume(job)} loading={busyId === job.id}>
                                      {m.retryFailed(job.failed_clips)}
                                    </Button>
                                  )}
                                  {job.kind === 'ai' && job.status === 'completed' && (
                                    <IconButton
                                      label={m.again}
                                      icon={<Search size={16} />}
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => again(job)}
                                      disabled={busyId === job.id}
                                    />
                                  )}
                                  <IconButton label={m.detailAria} icon={<Eye size={16} />} variant="ghost" size="sm" onClick={() => openDetail(job)} />
                                  <IconButton
                                    label={m.delete}
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
        title={m.cancelModal.title}
        message={m.cancelModal.message}
        confirmLabel={m.cancelModal.confirm}
        confirmIcon={<XCircle size={16} />}
        danger
        loading={!!busyId}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
      <ConfirmModal
        isOpen={pending?.kind === 'delete'}
        title={m.deleteModal.title}
        message={m.deleteModal.message}
        confirmLabel={m.deleteModal.confirm}
        confirmIcon={<Trash2 size={16} />}
        danger
        loading={!!busyId}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  )
}
