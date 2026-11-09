'use client'

import React, { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, CheckCircle, Loader2, Video, AlertCircle, RotateCcw, XCircle, ListChecks, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/InputField'
import { SelectField } from '@/components/ui/SelectField'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { NoAgentState } from '@/components/NoAgentState'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Job } from '@/lib/engine'
import { CLIP_DURATION_OPTIONS, JOB_STATUS, JOB_STEPS, RESUMABLE_JOB_STATUSES, errorMessage, formatDateTime, isYoutubeUrl } from '@/lib/format'

export default function DiscoverPage() {
  return (
    <Suspense fallback={<Skeleton height={400} />}>
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
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <PageHeader title="Cari & Ekstrak Konten" />
        <NoAgentState what="Cari Video" />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <PageHeader
        title="Cari & Ekstrak Konten"
        subtitle="Tempel link video YouTube, lalu biarkan AI memotong klip terbaik untuk Anda."
        actions={
          jobId ? (
            <Button variant="secondary" size="sm" icon={<ArrowLeft size={14} />} onClick={() => router.push('/discover/')}>
              Job baru
            </Button>
          ) : undefined
        }
      />
      {jobId ? <JobProgress key={jobId} jobId={jobId} /> : <JobForm key={activeAgent.id} onCreated={(id) => router.push(`/discover/?job=${encodeURIComponent(id)}`)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function JobForm({ onCreated }: { onCreated: (jobId: string) => void }) {
  const { activeAgent } = useAgent()
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [duration, setDuration] = useState(activeAgent?.default_duration || '45-60')
  const [maxClips, setMaxClips] = useState<number>(3)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAgent) return
    setFormError(null)
    if (!isYoutubeUrl(youtubeUrl)) {
      setFormError('Format URL tidak valid. Masukkan link YouTube yang benar (youtube.com/watch?v=… atau youtu.be/…).')
      return
    }
    setSubmitting(true)
    try {
      const { job } = await api.jobs.create({
        agent_id: activeAgent.id,
        youtube_url: youtubeUrl.trim(),
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

  return (
    <form onSubmit={submit}>
      <GlassCard glow hoverEffect={false} padding="36px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '26px', marginBottom: '28px' }}>
          <InputField
            label="Link YouTube"
            placeholder="https://www.youtube.com/watch?v=…"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            icon={<Video size={18} />}
            autoFocus
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
            <SelectField label="Durasi Clip" value={duration} onChange={(e) => setDuration(e.target.value)} options={CLIP_DURATION_OPTIONS} />
            <InputField
              label="Jumlah Klip (maks.)"
              type="number"
              min={0}
              max={100}
              placeholder="0 = tanpa batas"
              value={maxClips}
              onChange={(e) => setMaxClips(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
        </div>

        {formError && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: 'var(--danger)', fontSize: '14px', marginBottom: '20px' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{formError}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-glass)', paddingTop: '26px' }}>
          <Button type="submit" variant="primary" loading={submitting} icon={<Sparkles size={18} />}>
            Mulai Jalankan Agent AI
          </Button>
        </div>
      </GlassCard>
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
    toast.success('Pipeline selesai! Clip siap diedit.')
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
      <GlassCard hoverEffect={false} padding="36px" style={{ textAlign: 'center' }}>
        <AlertCircle size={40} color="var(--danger)" style={{ margin: '0 auto 14px' }} />
        <p style={{ color: 'var(--text-dim)', marginBottom: '20px' }}>{loadError}</p>
        <Button variant="secondary" onClick={() => router.push('/discover/')}>
          Kembali
        </Button>
      </GlassCard>
    )
  }

  if (!job) {
    return (
      <GlassCard hoverEffect={false} padding="36px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Skeleton height={28} width={260} />
          <Skeleton height={10} />
          {JOB_STEPS.map((s) => (
            <Skeleton key={s.id} height={22} width="70%" />
          ))}
        </div>
      </GlassCard>
    )
  }

  const status = JOB_STATUS[job.status]
  const active = job.status === 'running' || job.status === 'pending'
  const stepIndex = job.status === 'completed' ? JOB_STEPS.length : Math.max(0, JOB_STEPS.findIndex((s) => s.id === job.current_step))

  return (
    <GlassCard glow hoverEffect={false} padding="36px">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700 }}>
              {active ? 'AI Pipeline sedang berjalan' : job.status === 'completed' ? 'Pipeline selesai' : 'Pipeline berhenti'}
            </h2>
            <Badge variant={status.variant} glow={false}>
              {status.label}
            </Badge>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', wordBreak: 'break-all' }}>
            Link: {job.source.youtube_url || '-'} · dimulai {formatDateTime(job.started_at || job.created_at)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {active && (
            <Button variant="danger" size="sm" icon={<XCircle size={14} />} onClick={() => setConfirmCancel(true)}>
              Batalkan
            </Button>
          )}
          {RESUMABLE_JOB_STATUSES.includes(job.status) && (
            <Button variant="primary" size="sm" icon={<RotateCcw size={14} />} onClick={resume} loading={busy}>
              Lanjutkan
            </Button>
          )}
          <Button variant="secondary" size="sm" icon={<ListChecks size={14} />} onClick={() => router.push('/jobs/')}>
            Antrian
          </Button>
        </div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <ProgressBar progress={job.progress_pct} animated={active} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '30px' }}>
        <span>{Math.round(job.progress_pct)}%</span>
        {job.total_scenes > 0 && (
          <span>
            Klip diproses: {job.processed_scenes}/{job.total_scenes}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '560px' }}>
        {JOB_STEPS.map((step, idx) => {
          const isPast = stepIndex > idx
          const isCurrent = stepIndex === idx && job.status !== 'completed'
          const failedHere = isCurrent && !active
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', opacity: !isPast && !isCurrent ? 0.35 : 1, transition: 'opacity 0.3s' }}>
              {isPast ? (
                <CheckCircle size={20} color="var(--accent)" />
              ) : failedHere ? (
                <XCircle size={20} color={job.status === 'failed' ? 'var(--danger)' : 'var(--warning)'} />
              ) : isCurrent ? (
                <Loader2 size={20} color="var(--primary)" className="animate-spin" />
              ) : (
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid var(--text-muted)' }} />
              )}
              <span style={{ fontSize: '15px', fontWeight: isCurrent ? 600 : 400, color: isCurrent ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                {step.label}
                {isCurrent && step.id === 'processing' && job.total_scenes > 0 ? ` (${job.processed_scenes}/${job.total_scenes})` : ''}
              </span>
            </div>
          )
        })}
      </div>

      {liveMessage && active && (
        <p className="mc-mono" style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-dim)', wordBreak: 'break-word' }}>
          › {liveMessage}
        </p>
      )}

      {job.errors.length > 0 && (
        <div style={{ marginTop: '26px', padding: '16px', borderRadius: '12px', border: '1px solid rgba(234, 33, 67, 0.5)', background: 'rgba(234, 33, 67, 0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '10px', color: 'var(--danger)' }}>
            <AlertCircle size={16} /> {job.errors.length} kesalahan
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            {job.errors.slice(-5).map((err, i) => (
              <li key={i} style={{ color: 'var(--text-dim)', wordBreak: 'break-word' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{JOB_STEPS.find((s) => s.id === err.step)?.label || err.step}:</strong> {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

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
    </GlassCard>
  )
}
