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
import { NoCampaignState } from '@/components/NoCampaignState'
import { useCampaign } from '@/contexts/CampaignContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, eventForCampaign, type Clip, type DashboardStats, type Job, type SecretName } from '@/lib/engine'
import { mediaUrl } from '@/lib/media'
import { QUEUE_HREF } from '@/lib/routes'
import { providerInfo } from '@/lib/llmProviders'
import { ACTIVE_JOB_STATUSES, errorMessage, formatClock, formatCompactNumber, formatDateTime, jobSource } from '@/lib/format'
import { tm, type Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

const LATEST_CLIPS = 6

function summary(t: Messages, ready: number | null, running: number | null, failed: boolean): string {
  const m = t.dashboard
  if (ready === null || running === null) return failed ? m.summaryUnavailable : m.summaryLoading
  const clipsPart = ready > 0 ? m.readyClips(ready) : m.noReadyClips
  const jobsPart = running > 0 ? m.runningJobs(running) : m.noRunningJobs
  return m.summary(clipsPart, jobsPart)
}

export default function DashboardOverview() {
  const { activeCampaign } = useCampaign()
  const campaignId = activeCampaign?.id
  const { epoch } = useEngine()
  const t = useT()
  const m = t.dashboard
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [missingKeys, setMissingKeys] = useState<SecretName[]>([])
  const [llmLabel, setLlmLabel] = useState('LLM')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    setError(null)
    try {
      const [s, j, c] = await Promise.all([api.dashboard.stats(id), api.jobs.list({ campaign_id: id, limit: 5 }), api.clips.list({ campaign_id: id })])
      setStats(s)
      setJobs(j.jobs.slice(0, 5))
      setClips(c.clips)
    } catch (err) {
      setError(errorMessage(err, tm().dashboard.loadFailed))
    }
  }, [])

  useEffect(() => {
    setStats(null)
    setJobs(null)
    setClips(null)
    if (campaignId) load(campaignId)
  }, [campaignId, load, epoch])

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
    if (!campaignId) return
    if (e.type === 'job.progress') {
      setJobs((prev) => prev?.map((j) => (j.id === e.id ? { ...j, status: e.status, current_step: e.current_step, progress_pct: e.progress_pct, total_scenes: e.total_scenes, processed_scenes: e.processed_scenes } : j)) ?? prev)
    } else if (e.type === 'job.status' || e.type === 'clip.created' || e.type === 'clip.deleted') {
      if (e.type === 'clip.deleted' || eventForCampaign(e, campaignId)) load(campaignId)
    }
  })

  if (!activeCampaign || !campaignId) {
    return (
      <>
        <PageHeader title={m.title} subtitle={m.subtitle} />
        <NoCampaignState what={m.title} />
      </>
    )
  }

  const readyCount = clips ? clips.filter((c) => c.status === 'ready').length : null
  const activeJobs = jobs ? jobs.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status)) : null
  const heroJob = activeJobs ? activeJobs.find((j) => j.status === 'running') || activeJobs[0] || null : null
  const latestClips = clips ? clips.slice(0, LATEST_CLIPS) : null

  return (
    <>
      <PageHeader title={activeCampaign.name} subtitle={summary(t, readyCount, activeJobs ? activeJobs.length : null, !!error)} />

      <div className="mc-stack mc-gap-32">
        {missingKeys.length > 0 && (
          <Alert
            tone="warning"
            icon={<KeyRound size={18} />}
            title={m.keys.title}
            action={
              <ButtonLink href="/settings/" variant="secondary" size="sm">
                {m.keys.openSettings}
              </ButtonLink>
            }
          >
            {m.keys.missing(missingKeys.map((k) => (k === 'groq_api_key' ? m.keys.groq : m.keys.llm(llmLabel))))}
          </Alert>
        )}

        {error && (
          <Alert
            tone="error"
            action={
              <Button variant="secondary" size="sm" onClick={() => load(campaignId)}>
                {t.common.retry}
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
            label={m.stats.readyClips}
          />
          <StatCard
            className="mc-col-3"
            icon={<Clapperboard size={18} aria-hidden="true" />}
            notchTone="ink"
            value={stats === null ? <Skeleton width={72} height={40} /> : formatCompactNumber(stats.videosProcessed)}
            label={m.stats.videosProcessed}
          />
          <Link href="/discover/" className="mc-card mc-card--dashed mc-card--interactive mc-stat mc-col-3" style={{ alignItems: 'center', justifyContent: 'center', gap: 16, textDecoration: 'none' }}>
            <span className="mc-label">{m.stats.newClip}</span>
            <span className={iconButtonClass({ variant: 'accent', size: 'lg', tooltip: false })} aria-hidden="true">
              <Plus size={22} />
            </span>
          </Link>
          <HeroCard job={heroJob} loading={jobs === null && !error} />
        </div>

        <div className="mc-grid">
          <Card className="mc-col-8">
            <CardHeader
              title={m.latestClips.title}
              subtitle={stats ? m.latestClips.made(stats.clipsGenerated, formatCompactNumber(stats.clipsGenerated)) : undefined}
              action={
                <ButtonLink href="/clips/" variant="ghost" size="sm" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
                  {m.latestClips.seeAll}
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
                title={m.latestClips.emptyTitle}
                description={m.latestClips.emptyDescription}
                action={
                  <ButtonLink href="/discover/" variant="secondary" size="sm">
                    {m.latestClips.openDiscover}
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
                    aria-label={m.latestClips.openClip(clip.hook_text || formatClock(clip.duration_seconds))}
                  >
                    {clip.files.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(clip.id, 'thumbnail', clip.updated_at)} alt="" loading="lazy" />
                    )}
                    <span className="mc-thumb__corner mc-thumb__corner--tl">
                      <ScoreBadge score={clip.viral_score} size="sm" manual={clip.origin === 'manual'} />
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
              title={m.latestJobs.title}
              size="sm"
              action={
                <ButtonLink href={QUEUE_HREF} variant="ghost" size="sm" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
                  {t.clips.tabs.queue}
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
              <p className="mc-muted">{m.latestJobs.empty}</p>
            ) : (
              <div className="mc-stack mc-gap-12">
                {jobs.map((job) => {
                  const title = jobSource(job).text || m.latestJobs.fallbackTitle
                  const active = ACTIVE_JOB_STATUSES.includes(job.status)
                  return (
                    <Link key={job.id} href={QUEUE_HREF} style={{ display: 'block', textDecoration: 'none' }}>
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
  const t = useT()
  const m = t.dashboard.hero
  if (loading) {
    return (
      <Card tone="ink" className="mc-col-3 mc-stat" style={{ justifyContent: 'space-between' }}>
        <Contour />
        <h2 className="mc-h2 mc-card__body">{m.running}</h2>
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
        <h2 className="mc-h2 mc-card__body">{m.idleTitle}</h2>
        <div className="mc-card__body mc-stack mc-gap-12">
          <p className="mc-muted">{m.idleText}</p>
          <div>
            <ButtonLink href="/discover/" variant="primary" size="sm">
              {t.dashboard.latestClips.openDiscover}
            </ButtonLink>
          </div>
        </div>
      </Card>
    )
  }

  const running = job.status === 'running'
  const step = job.current_step ? t.jobs.stepShort[job.current_step] : t.status.job.pending
  return (
    <Card tone="ink" className="mc-col-3 mc-stat" style={{ justifyContent: 'space-between' }}>
      <Contour />
      <Notch icon={<ArrowUpRight size={18} />} position="end" label={m.seeQueue} href={QUEUE_HREF} />
      <h2 className="mc-h2 mc-card__body">{m.running}</h2>
      <div className="mc-card__body mc-stack mc-gap-12">
        <div className="mc-display">{running ? `${Math.round(job.progress_pct)}%` : m.queued}</div>
        <ProgressBar value={job.progress_pct} label={t.jobs.progressLabel} />
        {job.total_scenes > 0 ? (
          <GooPair first={step} second={m.clipOf(job.processed_scenes, job.total_scenes)} />
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
