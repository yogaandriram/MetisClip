'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Activity, Eye, Film, Flame, KeyRound, Play, Sparkles, ArrowRight } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { NoAgentState } from '@/components/NoAgentState'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Clip, type DashboardStats, type Job, type SecretName } from '@/lib/engine'
import { mediaUrl } from '@/lib/media'
import { JOB_STATUS, errorMessage, formatClock, formatCompactNumber, formatDateTime, jobStepLabel } from '@/lib/format'

export default function DashboardOverview() {
  const router = useRouter()
  const { activeAgent } = useAgent()
  const { epoch } = useEngine()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [missingKeys, setMissingKeys] = useState<SecretName[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (agentId: string) => {
    setError(null)
    try {
      const [s, j, c] = await Promise.all([api.dashboard.stats(agentId), api.jobs.list({ agent_id: agentId, limit: 5 }), api.clips.list({ agent_id: agentId })])
      setStats(s)
      setJobs(j.jobs.slice(0, 5))
      setClips(c.clips.slice(0, 6))
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
    api.secrets
      .status()
      .then(({ secrets }) => setMissingKeys((['llm_api_key', 'groq_api_key'] as SecretName[]).filter((k) => !secrets[k])))
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
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <PageHeader title="Beranda" subtitle="Ringkasan aktivitas agentic AI." />
        <NoAgentState what="Beranda" />
      </div>
    )
  }

  const statCards = [
    { label: 'Potensi Views', value: stats ? formatCompactNumber(stats.potentialViews) : null, icon: Eye, color: 'var(--accent)', bg: 'rgba(7, 202, 107, 0.1)', note: 'Estimasi dari skor viral klip' },
    { label: 'Video Diproses', value: stats ? formatCompactNumber(stats.videosProcessed) : null, icon: Play, color: 'var(--primary)', bg: 'rgba(24, 86, 255, 0.1)', note: 'Total video sumber' },
    { label: 'Clip Dihasilkan', value: stats ? formatCompactNumber(stats.clipsGenerated) : null, icon: Film, color: 'var(--warning)', bg: 'rgba(232, 149, 88, 0.1)', note: 'Total klip vertikal' },
  ]

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <PageHeader
        title="Beranda"
        subtitle={`Ringkasan aktivitas untuk ${activeAgent.name}.`}
        actions={
          <Link href="/discover/" style={{ textDecoration: 'none' }}>
            <Button variant="primary" icon={<Sparkles size={16} />}>
              Cari video baru
            </Button>
          </Link>
        }
      />

      {missingKeys.length > 0 && (
        <GlassCard hoverEffect={false} padding="16px 20px" style={{ border: '1px solid var(--warning)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <KeyRound size={18} color="var(--warning)" />
          <span style={{ flex: 1, fontSize: '14px', minWidth: '240px' }}>
            {missingKeys.includes('llm_api_key') ? 'API key LLM' : 'API key Groq'}
            {missingKeys.length > 1 ? ' dan API key Groq' : ''} belum diisi. Pipeline AI tidak akan berjalan tanpa key ini.
          </span>
          <Link href="/settings/" className="mc-link-button" style={{ textDecoration: 'none' }}>
            Buka Pengaturan
          </Link>
        </GlassCard>
      )}

      {error && (
        <GlassCard hoverEffect={false} padding="16px 20px" style={{ border: '1px solid var(--danger)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ flex: 1, fontSize: '14px' }}>{error}</span>
          <button className="mc-link-button" onClick={() => load(activeAgent.id)}>
            Coba lagi
          </button>
        </GlassCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <GlassCard key={card.label} glow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
                <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>{card.label}</span>
                <div style={{ background: card.bg, padding: '8px', borderRadius: '8px', color: card.color }}>
                  <Icon size={20} />
                </div>
              </div>
              {card.value === null ? <Skeleton height={40} width={120} /> : <div style={{ fontSize: '36px', fontWeight: 800 }}>{card.value}</div>}
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Activity size={12} />
                <span>{card.note}</span>
              </div>
            </GlassCard>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px', alignItems: 'start' }}>
        <section>
          <SectionHeader title="Job terbaru" href="/jobs/" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {jobs === null ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={76} />)
            ) : jobs.length === 0 ? (
              <EmptyLine text="Belum ada job. Mulai dari menu Cari Video." />
            ) : (
              jobs.map((job) => {
                const s = JOB_STATUS[job.status]
                const title = job.source.type === 'url' ? job.source.youtube_url : job.source.keywords.join(', ')
                return (
                  <GlassCard key={job.id} padding="16px" onClick={() => router.push('/jobs/')} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Job'}</span>
                      <Badge variant={s.variant} glow={false}>
                        {s.label}
                      </Badge>
                    </div>
                    {job.status === 'running' || job.status === 'pending' ? (
                      <>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>{jobStepLabel(job.current_step)}</div>
                        <ProgressBar progress={job.progress_pct} height="6px" />
                      </>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDateTime(job.finished_at || job.created_at)}</div>
                    )}
                  </GlassCard>
                )
              })
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="Clip terbaru" href="/clips/" />
          {clips === null ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height={200} />
              ))}
            </div>
          ) : clips.length === 0 ? (
            <EmptyLine text="Belum ada clip yang dihasilkan." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '12px' }}>
              {clips.map((clip) => (
                <Link key={clip.id} href={`/clips/detail/?id=${encodeURIComponent(clip.id)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ position: 'relative', aspectRatio: '9 / 16', borderRadius: '12px', overflow: 'hidden', background: '#000', border: '1px solid var(--border-glass)' }}>
                    {clip.files.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(clip.id, 'thumbnail', clip.updated_at)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} loading="lazy" />
                    )}
                    <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
                      <Badge variant="accent" glow={false} icon={<Flame size={11} />}>
                        {Math.round(clip.viral_score)}
                      </Badge>
                    </div>
                    <div style={{ position: 'absolute', bottom: '8px', right: '8px', fontSize: '11px', background: 'rgba(0,0,0,0.75)', padding: '2px 6px', borderRadius: '6px' }}>
                      {formatClock(clip.duration_seconds)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700 }}>{title}</h2>
      <Link href={href} className="mc-link-button" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        Lihat semua <ArrowRight size={14} />
      </Link>
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <div style={{ padding: '24px', borderRadius: '12px', border: '1px dashed var(--border-glass)', color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>{text}</div>
}
