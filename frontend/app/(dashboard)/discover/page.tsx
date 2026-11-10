'use client'

import React, { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Clapperboard, Link2, ListChecks, RotateCcw, Upload, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ChoiceChips,
  ConfirmModal,
  Field,
  InputField,
  NumberStepper,
  PageHeader,
  PipelineSteps,
  ProgressBar,
  Skeleton,
  StatusBadge,
  Tabs,
  type StepState,
} from '@/components/ui'
import { NoAgentState } from '@/components/NoAgentState'
import { VideoFilePicker } from '@/components/discover/VideoFilePicker'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Job, type JobStep } from '@/lib/engine'
import {
  CLIP_DURATION_OPTIONS,
  JOB_STEPS,
  RESUMABLE_JOB_STATUSES,
  errorMessage,
  formatDateTime,
  isYoutubeUrl,
  jobSource,
  jobStepLabel,
} from '@/lib/format'

const CONTENT: React.CSSProperties = { maxWidth: 760, margin: '0 auto' }

/** "45 - 60 detik (Shorts/Reels)" -> chip "45–60 detik", hint "Format Shorts/Reels" */
const DURATION_CHOICES = CLIP_DURATION_OPTIONS.map((o) => {
  const m = o.label.match(/^(.*?)\s*\((.+)\)$/)
  return { value: o.value, label: m ? m[1].replace(/\s*-\s*/, '–') : o.label, kind: m ? m[2] : null }
})

/** Short pill labels for the pipeline steps; the full label of the current step is shown below them. */
const STEP_SHORT: Record<JobStep, string> = { discovery: 'Discovery', analysis: 'Analisis', processing: 'Proses' }

export default function DiscoverPage() {
  return (
    <Suspense fallback={<Skeleton height={400} radius="lg" />}>
      <Discover />
    </Suspense>
  )
}

function Discover() {
  const router = useRouter()
  const params = useSearchParams()
  const jobId = params.get('job')
  const { activeAgent } = useAgent()

  if (!activeAgent) {
    return (
      <div>
        <PageHeader title="Cari & Ekstrak Konten" />
        <div style={CONTENT}>
          <NoAgentState what="Cari Video" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Cari & Ekstrak Konten"
        subtitle="Tempel link YouTube atau upload video dari komputer, lalu biarkan AI memotong klip terbaik untuk Anda."
        actions={
          jobId ? (
            <Button variant="secondary" size="sm" icon={<ArrowLeft size={16} />} onClick={() => router.push('/discover/')}>
              Job baru
            </Button>
          ) : undefined
        }
      />
      <div style={CONTENT}>
        {jobId ? (
          <JobProgress key={jobId} jobId={jobId} />
        ) : (
          <JobForm key={activeAgent.id} onCreated={(id) => router.push(`/discover/?job=${encodeURIComponent(id)}`)} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function JobForm({ onCreated }: { onCreated: (jobId: string) => void }) {
  const { activeAgent } = useAgent()
  const [mode, setMode] = useState<'url' | 'file'>('url')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [duration, setDuration] = useState(activeAgent?.default_duration || '45-60')
  const [maxClips, setMaxClips] = useState<number>(3)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAgent) return
    setFormError(null)
    if (mode === 'url' && !isYoutubeUrl(youtubeUrl)) {
      setFormError('Format URL tidak valid. Masukkan link YouTube yang benar (youtube.com/watch?v=… atau youtu.be/…).')
      return
    }
    if (mode === 'file' && !filePath) {
      setFormError('Pilih file video dulu.')
      return
    }
    setSubmitting(true)
    try {
      const { job } = await api.jobs.create({
        agent_id: activeAgent.id,
        ...(mode === 'url' ? { youtube_url: youtubeUrl.trim() } : { local_file_path: filePath! }),
        clip_duration: duration,
        max_clips: maxClips,
      })
      toast.success('Job dimulai')
      onCreated(job.id)
    } catch (err) {
      setFormError(errorMessage(err, 'Gagal memulai job'))
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = (m: 'url' | 'file') => {
    setMode(m)
    setFormError(null)
  }

  const durationKind = DURATION_CHOICES.find((o) => o.value === duration)?.kind

  return (
    <form onSubmit={submit}>
      <Card padding="lg">
        <div className="mc-stack mc-gap-24">
          <Tabs
            ariaLabel="Sumber video"
            tabs={[
              { id: 'url', label: 'Link YouTube', icon: <Link2 size={16} aria-hidden="true" /> },
              { id: 'file', label: 'Upload Video', icon: <Upload size={16} aria-hidden="true" /> },
            ]}
            activeTab={mode}
            onChange={(id) => switchMode(id as 'url' | 'file')}
          />

          {mode === 'url' ? (
            <InputField
              label="Link YouTube"
              placeholder="https://www.youtube.com/watch?v=…"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              icon={<Link2 size={18} aria-hidden="true" />}
              inputSize="lg"
              autoFocus
            />
          ) : (
            <VideoFilePicker value={filePath} onChange={setFilePath} onError={setFormError} />
          )}

          <Field label="Durasi klip" hint={durationKind ? `Format ${durationKind}` : undefined}>
            <ChoiceChips
              ariaLabel="Durasi klip"
              options={DURATION_CHOICES.map(({ value, label }) => ({ value, label }))}
              value={duration}
              onChange={setDuration}
            />
          </Field>

          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="mc-row mc-row--between mc-row--wrap mc-gap-16" style={{ alignItems: 'flex-end' }}>
            <NumberStepper
              label="Jumlah klip (maks.)"
              value={maxClips}
              onChange={setMaxClips}
              min={0}
              max={100}
              format={(n) => (n === 0 ? 'Tanpa batas' : String(n))}
            />
            <Button type="submit" variant="primary" size="lg" loading={submitting} icon={<Clapperboard size={18} aria-hidden="true" />}>
              Mulai proses
            </Button>
          </div>
        </div>
      </Card>
    </form>
  )
}

// ---------------------------------------------------------------------------

function JobProgress({ jobId }: { jobId: string }) {
  const router = useRouter()
  const { epoch } = useEngine()
  const [job, setJob] = useState<Job | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [liveMessage, setLiveMessage] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { job } = await api.jobs.get(jobId)
      setJob(job)
      setLoadError(null)
    } catch (err) {
      setLoadError(errorMessage(err, 'Job tidak ditemukan'))
    }
  }, [jobId])

  useEffect(() => {
    load()
  }, [load, epoch])

  useEngineEvents((e) => {
    if (e.type === 'job.progress' && e.id === jobId) {
      setJob((prev) =>
        prev
          ? { ...prev, status: e.status, current_step: e.current_step, progress_pct: e.progress_pct, total_scenes: e.total_scenes, processed_scenes: e.processed_scenes }
          : prev
      )
      if (e.message) setLiveMessage(e.message)
    } else if (e.type === 'job.status' && e.id === jobId) {
      setJob((prev) => (prev ? { ...prev, status: e.status } : prev))
      if (e.error) setLiveMessage(e.error)
      load()
    }
  })

  // Completed -> go to the clips gallery
  useEffect(() => {
    if (job?.status !== 'completed') return
    toast.success('Pipeline selesai. Clip siap diedit.')
    const t = setTimeout(() => router.push('/clips/'), 1500)
    return () => clearTimeout(t)
  }, [job?.status, router])

  const cancel = async () => {
    setBusy(true)
    try {
      const { job } = await api.jobs.cancel(jobId)
      setJob(job)
      setConfirmCancel(false)
      toast.success('Job dibatalkan')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const resume = async () => {
    setBusy(true)
    try {
      const { job } = await api.jobs.resume(jobId)
      setJob(job)
      setLiveMessage(null)
      toast.success('Job dilanjutkan dari checkpoint terakhir')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loadError && !job) {
    return (
      <Alert
        tone="error"
        title="Gagal memuat job"
        action={
          <Button variant="secondary" size="sm" onClick={() => router.push('/discover/')}>
            Kembali
          </Button>
        }
      >
        {loadError}
      </Alert>
    )
  }

  if (!job) {
    return (
      <Card padding="lg">
        <div className="mc-stack">
          <Skeleton height={28} width={260} />
          <Skeleton height={8} radius="full" />
          <div className="mc-row">
            {JOB_STEPS.map((s) => (
              <Skeleton key={s.id} height={32} width={110} radius="full" />
            ))}
          </div>
        </div>
      </Card>
    )
  }

  const active = job.status === 'running' || job.status === 'pending'
  const stepIndex = job.status === 'completed' ? JOB_STEPS.length : Math.max(0, JOB_STEPS.findIndex((s) => s.id === job.current_step))
  const source = jobSource(job)

  const steps = JOB_STEPS.map((step, idx) => {
    const isCurrent = stepIndex === idx && job.status !== 'completed'
    const state: StepState = stepIndex > idx ? 'done' : isCurrent ? (active ? 'active' : 'failed') : 'todo'
    const count = isCurrent && step.id === 'processing' && job.total_scenes > 0 ? ` (${job.processed_scenes}/${job.total_scenes})` : ''
    return { id: step.id, label: `${STEP_SHORT[step.id]}${count}`, state }
  })

  return (
    <Card padding="lg">
      <div className="mc-stack mc-gap-24">
        <div className="mc-row mc-row--between mc-row--top mc-row--wrap mc-gap-16">
          <div className="mc-stack mc-gap-8 mc-grow">
            <div className="mc-row mc-row--wrap">
              <h2 className="mc-h2">{active ? 'AI Pipeline sedang berjalan' : job.status === 'completed' ? 'Pipeline selesai' : 'Pipeline berhenti'}</h2>
              <StatusBadge kind="job" status={job.status} />
            </div>
            <p className="mc-caption mc-muted" style={{ wordBreak: 'break-all' }}>
              {source.label}: {source.text} · dimulai {formatDateTime(job.started_at || job.created_at)}
            </p>
          </div>
          <div className="mc-row mc-row--wrap mc-gap-8">
            {active && (
              <Button variant="danger" size="sm" icon={<X size={16} aria-hidden="true" />} onClick={() => setConfirmCancel(true)}>
                Batalkan
              </Button>
            )}
            {RESUMABLE_JOB_STATUSES.includes(job.status) && (
              <Button variant="primary" size="sm" icon={<RotateCcw size={16} aria-hidden="true" />} onClick={resume} loading={busy}>
                Lanjutkan
              </Button>
            )}
            <ButtonLink href="/jobs/" variant="secondary" size="sm" icon={<ListChecks size={16} aria-hidden="true" />}>
              Antrian
            </ButtonLink>
          </div>
        </div>

        <div className="mc-stack mc-gap-8">
          <ProgressBar value={job.progress_pct} label="Progres job" showValue />
          {job.total_scenes > 0 && (
            <span className="mc-caption mc-muted">
              Klip diproses: <span className="mc-mono">{job.processed_scenes}/{job.total_scenes}</span>
            </span>
          )}
        </div>

        <div className="mc-stack mc-gap-12">
          <PipelineSteps steps={steps} />
          {active && <p className="mc-muted">{jobStepLabel(job.current_step)}</p>}
          {liveMessage && active && (
            <p className="mc-caption mc-mono mc-muted" style={{ wordBreak: 'break-word' }}>
              › {liveMessage}
            </p>
          )}
        </div>

        {job.errors.length > 0 && (
          <Alert tone="error" title={`${job.errors.length} kesalahan`}>
            <ul className="mc-stack mc-gap-8" style={{ listStyle: 'none' }}>
              {job.errors.slice(-5).map((err, i) => (
                <li key={i} style={{ wordBreak: 'break-word' }}>
                  <span className="mc-label">{JOB_STEPS.find((s) => s.id === err.step)?.label || err.step}:</span> {err.message}
                </li>
              ))}
            </ul>
          </Alert>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmCancel}
        title="Batalkan job ini?"
        message="Proses yang sedang berjalan akan dihentikan. Klip yang sudah selesai tetap tersimpan, dan job bisa dilanjutkan lagi dari Antrian."
        confirmLabel="Batalkan job"
        danger
        loading={busy}
        onConfirm={cancel}
        onClose={() => setConfirmCancel(false)}
      />
    </Card>
  )
}
