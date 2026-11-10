'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Clapperboard, Film, KeyRound, Plus } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Contour,
  EmptyState,
  GooPair,
  Notch,
  PageHeader,
  ProgressBar,
  ProgressRow,
  ScoreBadge,
  Skeleton,
  StatCard,
  StatusBadge,
  iconButtonClass,
} from '@/components/ui'
import { NoAgentState } from '@/components/NoAgentState'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Clip, type DashboardStats, type Job, type JobStep, type SecretName } from '@/lib/engine'
import { mediaUrl } from '@/lib/media'
import { providerInfo } from '@/lib/llmProviders'
import { ACTIVE_JOB_STATUSES, errorMessage, formatClock, formatCompactNumber, formatDateTime, jobSource } from '@/lib/format'

const LATEST_CLIPS = 6

/** Short step names for the pills (DESIGN.md §8.9). */
const STEP_SHORT: Record<JobStep, string> = {
  discovery: 'Discovery',
  analysis: 'Analisis',
  processing: 'Proses',
}

function summary(ready: number | null, running: number | null, failed: boolean): string {
  if (ready === null || running === null) return failed ? 'Ringkasan belum bisa dimuat.' : 'Memuat ringkasan…'
  const clipsPart = ready > 0 ? `${ready} klip siap ekspor` : 'Belum ada klip siap ekspor'
  const jobsPart = running > 0 ? `${running} proses berjalan` : 'tidak ada proses berjalan'
  return `${clipsPart}, ${jobsPart}.`
}

export default function DashboardOverview() {
  const { activeAgent } = useAgent()
  const { epoch } = useEngine()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [missingKeys, setMissingKeys] = useState<SecretName[]>([])
  const [llmLabel, setLlmLabel] = useState('LLM')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (agentId: string) => {
    setError(null)
    try {
      const [s, j, c] = await Promise.all([api.dashboard.stats(agentId), api.jobs.list({ agent_id: agentId, limit: 5 }), api.clips.list({ agent_id: agentId })])
      setStats(s)
      setJobs(j.jobs.slice(0, 5))
      setClips(c.clips)
    } catch (err) {
      setError(errorMessage(err, 'Gagal memuat ringkasan'))
    }
  }, [])

  useEffect(() => {
    setStats(null)
    setJobs(null)
    setClips(null)
    if (activeAgent) load(activeAgent.id)
  }, [activeAgent, load, epoch])

  useEffect(() => {
    Promise.all([api.secrets.status(), api.settings.get()])
      .then(([{ secrets }, { settings }]) => {
        const llmKey = providerInfo(settings.llm.provider).secret
        setLlmLabel(providerInfo(settings.llm.provider).label)
        // Groq is only required when transcription is set to "Selalu Groq"; otherwise local Whisper covers it
        const required: SecretName[] = settings.whisper.provider === 'groq' ? [llmKey, 'groq_api_key'] : [llmKey]
        setMissingKeys(required.filter((k) => !secrets[k]))
      })
      .catch(() => setMissingKeys([]))
  }, [epoch])

  useEngineEvents((e) => {
    if (!activeAgent) return
    if (e.type === 'job.progress') {
      setJobs((prev) => prev?.map((j) => (j.id === e.id ? { ...j, status: e.status, current_step: e.current_step, progress_pct: e.progress_pct, total_scenes: e.total_scenes, processed_scenes: e.processed_scenes } : j)) ?? prev)
    } else if (e.type === 'job.status' || e.type === 'clip.created' || e.type === 'clip.deleted') {
      if (e.type === 'clip.deleted' || e.agent_id === activeAgent.id) load(activeAgent.id)
    }
  })

  if (!activeAgent) {
    return (
      <>
        <PageHeader title="Beranda" subtitle="Ringkasan aktivitas agentic AI." />
        <NoAgentState what="Beranda" />
      </>
    )
  }

  const readyCount = clips ? clips.filter((c) => c.status === 'ready').length : null
  const activeJobs = jobs ? jobs.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status)) : null
  const heroJob = activeJobs ? activeJobs.find((j) => j.status === 'running') || activeJobs[0] || null : null
  const latestClips = clips ? clips.slice(0, LATEST_CLIPS) : null

  return (
    <>
      <PageHeader title={activeAgent.name} subtitle={summary(readyCount, activeJobs ? activeJobs.length : null, !!error)} />

      <div className="mc-stack mc-gap-32">
        {missingKeys.length > 0 && (
          <Alert
            tone="warning"
            icon={<KeyRound size={18} />}
            title="API key belum lengkap"
            action={
              <ButtonLink href="/settings/" variant="secondary" size="sm">
                Buka Pengaturan
              </ButtonLink>
            }
          >
            {missingKeys[0] === 'groq_api_key' ? 'API key Groq' : `API key ${llmLabel}`}
            {missingKeys.length > 1 ? ' dan API key Groq' : ''} belum diisi. Pipeline AI tidak akan berjalan tanpa key ini.
          </Alert>
        )}

        {error && (
          <Alert
            tone="error"
            action={
              <Button variant="secondary" size="sm" onClick={() => load(activeAgent.id)}>
                Coba lagi
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        <div className="mc-grid">
          <StatCard
            className="mc-col-3"
            tilt
            blob
            icon={<Film size={18} aria-hidden="true" />}
            value={readyCount === null ? <Skeleton width={72} height={40} /> : formatCompactNumber(readyCount)}
            label="Klip siap ekspor"
          />
          <StatCard
            className="mc-col-3"
            icon={<Clapperboard size={18} aria-hidden="true" />}
            notchTone="ink"
            value={stats === null ? <Skeleton width={72} height={40} /> : formatCompactNumber(stats.videosProcessed)}
            label="Video diproses"
          />
          <Link href="/discover/" className="mc-card mc-card--dashed mc-card--interactive mc-stat mc-col-3" style={{ alignItems: 'center', justifyContent: 'center', gap: 16, textDecoration: 'none' }}>
            <span className="mc-label">Buat klip baru</span>
            <span className={iconButtonClass({ variant: 'accent', size: 'lg', tooltip: false })} aria-hidden="true">
              <Plus size={22} />
            </span>
          </Link>
          <HeroCard job={heroJob} loading={jobs === null && !error} />
        </div>

        <div className="mc-grid">
          <Card className="mc-col-8">
            <CardHeader
              title="Klip terbaru"
              subtitle={stats ? `${formatCompactNumber(stats.clipsGenerated)} klip dibuat di workspace ini` : undefined}
              action={
                <ButtonLink href="/clips/" variant="ghost" size="sm" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
                  Lihat semua
                </ButtonLink>
              }
            />
            {latestClips === null ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LATEST_CLIPS}, minmax(0, 1fr))`, gap: 12 }}>
                {Array.from({ length: LATEST_CLIPS }).map((_, i) => (
                  <Skeleton key={i} height="auto" radius="md" style={{ aspectRatio: '9 / 16' }} />
                ))}
              </div>
            ) : latestClips.length === 0 ? (
              <EmptyState
                icon={Film}
                title="Belum ada klip"
                description="Tempel link YouTube atau pilih file video di Cari Video untuk membuat klip pertama."
                action={
                  <ButtonLink href="/discover/" variant="secondary" size="sm">
                    Buka Cari Video
                  </ButtonLink>
                }
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LATEST_CLIPS}, minmax(0, 1fr))`, gap: 12 }}>
                {latestClips.map((clip) => (
                  <Link
                    key={clip.id}
                    href={`/clips/detail/?id=${encodeURIComponent(clip.id)}`}
                    className="mc-thumb"
                    style={{ display: 'block', aspectRatio: '9 / 16' }}
                    aria-label={`Buka klip: ${clip.hook_text || formatClock(clip.duration_seconds)}`}
                  >
                    {clip.files.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(clip.id, 'thumbnail', clip.updated_at)} alt="" loading="lazy" />
                    )}
                    <span className="mc-thumb__corner mc-thumb__corner--tl">
                      <ScoreBadge score={clip.viral_score} size="sm" />
                    </span>
                    <span className="mc-thumb__corner mc-thumb__corner--br">
                      <Badge tone="ink" size="sm">
                        <span className="mc-mono">{formatClock(clip.duration_seconds)}</span>
                      </Badge>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card tone="dew" className="mc-col-4">
            <CardHeader
              title="Job terbaru"
              size="sm"
              action={
                <ButtonLink href="/jobs/" variant="ghost" size="sm" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
                  Antrian
                </ButtonLink>
              }
            />
            {jobs === null ? (
              <div className="mc-stack mc-gap-8">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} height={44} radius="full" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <p className="mc-muted">Belum ada job. Mulai dari Cari Video.</p>
            ) : (
              <div className="mc-stack mc-gap-12">
                {jobs.map((job) => {
                  const title = jobSource(job).text || 'Job'
                  const active = ACTIVE_JOB_STATUSES.includes(job.status)
                  return (
                    <Link key={job.id} href="/jobs/" style={{ display: 'block', textDecoration: 'none' }}>
                      {active ? (
                        <ProgressRow label={title} value={`${Math.round(job.progress_pct)}%`} percent={job.progress_pct} />
                      ) : (
                        <div className="mc-row mc-row--between mc-gap-12">
                          <div className="mc-grow">
                            <div className="mc-label mc-truncate">{title}</div>
                            <div className="mc-caption mc-muted">{formatDateTime(job.finished_at || job.created_at)}</div>
                          </div>
                          <StatusBadge kind="job" status={job.status} size="sm" />
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

/** Ink hero: the running job with live progress, or a prompt to start one. */
function HeroCard({ job, loading }: { job: Job | null; loading: boolean }) {
  if (loading) {
    return (
      <Card tone="ink" className="mc-col-3 mc-stat" style={{ justifyContent: 'space-between' }}>
        <Contour />
        <h2 className="mc-h2 mc-card__body">Proses berjalan</h2>
        <div className="mc-card__body mc-stack mc-gap-12">
          <Skeleton width={96} height={40} />
          <Skeleton height={8} radius="full" />
        </div>
      </Card>
    )
  }

  if (!job) {
    return (
      <Card tone="ink" className="mc-col-3 mc-stat" style={{ justifyContent: 'space-between' }}>
        <Contour />
        <h2 className="mc-h2 mc-card__body">Tempel link YouTube</h2>
        <div className="mc-card__body mc-stack mc-gap-12">
          <p className="mc-muted">Tidak ada proses berjalan. Mulai dari link video panjang atau file di PC Anda.</p>
          <div>
            <ButtonLink href="/discover/" variant="primary" size="sm">
              Buka Cari Video
            </ButtonLink>
          </div>
        </div>
      </Card>
    )
  }

  const running = job.status === 'running'
  const step = job.current_step ? STEP_SHORT[job.current_step] : 'Menunggu'
  return (
    <Card tone="ink" className="mc-col-3 mc-stat" style={{ justifyContent: 'space-between' }}>
      <Contour />
      <Notch icon={<ArrowUpRight size={18} />} position="end" label="Lihat antrian" href="/jobs/" />
      <h2 className="mc-h2 mc-card__body">Proses berjalan</h2>
      <div className="mc-card__body mc-stack mc-gap-12">
        <div className="mc-display">{running ? `${Math.round(job.progress_pct)}%` : 'Antri'}</div>
        <ProgressBar value={job.progress_pct} label="Progres job" />
        {job.total_scenes > 0 ? (
          <GooPair first={step} second={`klip ${job.processed_scenes} dari ${job.total_scenes}`} />
        ) : (
          <div>
            <Badge tone="neutral" size="sm">
              {step}
            </Badge>
          </div>
        )}
      </div>
    </Card>
  )
}
