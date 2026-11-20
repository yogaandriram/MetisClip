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
  TextAreaField,
  ToggleSwitch,
  type StepState,
} from '@/components/ui'
import { NoCampaignState } from '@/components/NoCampaignState'
import { VideoFilePicker } from '@/components/discover/VideoFilePicker'
import { CampaignPicker } from '@/components/brief/CampaignPicker'
import { MomentsEditor, momentRanges, newMomentRow, type MomentRow } from '@/components/clips/MomentsEditor'
import { useCampaign } from '@/contexts/CampaignContext'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Campaign, type Job } from '@/lib/engine'
import { CUSTOM_DURATION, briefDurationBounds, parseDuration, suggestDuration, validCustomDuration } from '@/lib/brief'
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
import { tm } from '@/lib/i18n'
import { resolveLayout } from '@/lib/presets/layout'
import { QUEUE_HREF } from '@/lib/routes'
import { useT } from '@/lib/i18n/I18nProvider'

const CONTENT: React.CSSProperties = { maxWidth: 760, margin: '0 auto' }
const CUSTOM = 'custom'
const NUMBER_FIELD: React.CSSProperties = { width: 160 }

/** "45 - 60 detik (Shorts/Reels)" -> chip "45–60 detik", kind "Shorts/Reels". Read at render time (current language). */
function durationChoices() {
  return CLIP_DURATION_OPTIONS.map((o) => {
    const m = o.label.match(/^(.*?)\s*\((.+)\)$/)
    return { value: o.value, label: m ? m[1].replace(/\s*-\s*/, '–') : o.label, kind: m ? m[2] : null }
  })
}

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
  const linked = params.get('campaign')
  const { activeCampaign, activeCampaigns, setActiveCampaign } = useCampaign()
  const t = useT()

  // From a campaign page (/discover/?campaign=<id>): that campaign becomes the active one
  const linkedActive = !!linked && activeCampaigns.some((c) => c.id === linked)
  useEffect(() => {
    if (linkedActive && linked) setActiveCampaign(linked)
  }, [linkedActive, linked, setActiveCampaign])

  if (!activeCampaign) {
    return (
      <div>
        <PageHeader title={t.discover.title} />
        <div style={CONTENT}>
          <NoCampaignState what={t.shell.nav.discover} />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={t.discover.title}
        subtitle={t.discover.subtitle}
        actions={
          jobId ? (
            <Button variant="secondary" size="sm" icon={<ArrowLeft size={16} />} onClick={() => router.push('/discover/')}>
              {t.discover.newJob}
            </Button>
          ) : undefined
        }
      />
      <div style={CONTENT}>
        {jobId ? (
          <JobProgress key={jobId} jobId={jobId} />
        ) : (
          <JobForm
            key={activeCampaign.id}
            initialCampaign={linkedActive ? linked : activeCampaign.id}
            onCreated={(id) => router.push(`/discover/?job=${encodeURIComponent(id)}`)}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** The job form. `initialCampaign` is chosen when the form opens (the active campaign, or the linked one). */
function JobForm({ onCreated, initialCampaign }: { onCreated: (jobId: string) => void; initialCampaign: string | null }) {
  const { epoch } = useEngine()
  const t = useT()
  const f = t.discover.form
  const b = t.brief
  const [mode, setMode] = useState<'url' | 'file'>('url')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [duration, setDuration] = useState('45-60')
  const [customLo, setCustomLo] = useState('30')
  const [customHi, setCustomHi] = useState('60')
  const [maxClips, setMaxClips] = useState<number>(3)
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [campaignsError, setCampaignsError] = useState<string | null>(null)
  const [campaignIds, setCampaignIds] = useState<string[]>([])
  const [note, setNote] = useState('')
  // The automatic layout by content for this job: null follows each campaign's default template
  const [smartChoice, setSmartChoice] = useState<boolean | null>(null)
  const [templateSmart, setTemplateSmart] = useState<'on' | 'off' | 'mixed' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // 'manual': the user writes the moments (the Analyzer is skipped)
  const [pick, setPick] = useState<'ai' | 'manual'>('ai')
  const [moments, setMoments] = useState<MomentRow[]>(() => [newMomentRow()])
  const [snapEdges, setSnapEdges] = useState(true)
  const [showMomentErrors, setShowMomentErrors] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.campaigns
      .list({ status: 'active' })
      .then(({ campaigns }) => {
        if (cancelled) return
        setCampaigns(campaigns)
        setCampaignsError(null)
        // The active campaign (or the one a campaign page linked to) is chosen to begin with
        if (initialCampaign && campaigns.some((c) => c.id === initialCampaign)) {
          setCampaignIds((prev) => (prev.length ? prev : [initialCampaign]))
        }
      })
      .catch((err) => {
        if (!cancelled) setCampaignsError(errorMessage(err, tm().brief.picker.loadFailed))
      })
    return () => {
      cancelled = true
    }
  }, [epoch, initialCampaign])

  /** The duration sent to the engine: a preset, or the custom range ('' while it is invalid). */
  const customValid = validCustomDuration(Number(customLo), Number(customHi))
  const clipDuration = duration === CUSTOM ? (customValid ? `${Number(customLo)}-${Number(customHi)}` : '') : duration
  const chosen = (campaigns || []).filter((c) => campaignIds.includes(c.id))
  const bounds = briefDurationBounds(chosen.map((c) => c.brief))
  const current = parseDuration(clipDuration)
  const suggestion = bounds && current ? suggestDuration(bounds, current) : null

  // What the chosen campaigns' default templates say about the automatic layout
  const templateKey = chosen.map((c) => c.brand_template_id || '').join(',')
  useEffect(() => {
    const ids = templateKey.split(',').filter(Boolean)
    if (ids.length === 0) {
      setTemplateSmart(null)
      return
    }
    let cancelled = false
    Promise.all(ids.map((id) => api.brandTemplates.get(id)))
      .then((res) => {
        if (cancelled) return
        const on = res.map(({ brand_template }) => resolveLayout(brand_template.layout_settings).smart.enabled)
        setTemplateSmart(on.every(Boolean) ? 'on' : on.some(Boolean) ? 'mixed' : 'off')
      })
      .catch(() => {
        if (!cancelled) setTemplateSmart(null)
      })
    return () => {
      cancelled = true
    }
  }, [templateKey, epoch])
  const smartChecked = smartChoice ?? templateSmart === 'on'
  const smartHint =
    smartChoice !== null
      ? f.smart.override
      : templateSmart === 'on'
        ? f.smart.followOn
        : templateSmart === 'off'
          ? f.smart.followOff
          : templateSmart === 'mixed'
            ? f.smart.followMixed
            : f.smart.hint

  const applySuggestion = ([lo, hi]: [number, number]) => {
    const preset = `${lo}-${hi}`
    if (CLIP_DURATION_OPTIONS.some((o) => o.value === preset)) {
      setDuration(preset)
    } else {
      setDuration(CUSTOM)
      setCustomLo(String(lo))
      setCustomHi(String(hi))
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (chosen.length === 0) {
      setFormError(b.picker.required)
      return
    }
    if (mode === 'url' && !isYoutubeUrl(youtubeUrl)) {
      setFormError(f.invalidUrl)
      return
    }
    if (mode === 'file' && !filePath) {
      setFormError(f.fileRequired)
      return
    }
    const ranges = pick === 'manual' ? momentRanges(moments) : null
    if (pick === 'manual' && !ranges) {
      setShowMomentErrors(true)
      setFormError(f.moments.invalid)
      return
    }
    if (pick === 'ai' && !clipDuration) {
      setFormError(f.customHint(CUSTOM_DURATION.min, CUSTOM_DURATION.max, CUSTOM_DURATION.span))
      return
    }
    setSubmitting(true)
    try {
      const { job } = await api.jobs.create({
        ...(mode === 'url' ? { youtube_url: youtubeUrl.trim() } : { local_file_path: filePath! }),
        campaign_ids: chosen.map((c) => c.id),
        smart_layout: smartChoice,
        ...(ranges
          ? { manual_ranges: ranges, snap_edges: snapEdges }
          : { clip_duration: clipDuration, max_clips: maxClips, note: note.trim() }),
      })
      toast.success(f.started)
      onCreated(job.id)
    } catch (err) {
      setFormError(errorMessage(err, f.startFailed))
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = (m: 'url' | 'file') => {
    setMode(m)
    setFormError(null)
  }

  const choices = durationChoices()
  const durationKind = choices.find((o) => o.value === duration)?.kind

  return (
    <form onSubmit={submit}>
      <Card padding="lg">
        <div className="mc-stack mc-gap-24">
          <Tabs
            ariaLabel={f.sourceTabs}
            tabs={[
              { id: 'url', label: f.tabLink, icon: <Link2 size={16} aria-hidden="true" /> },
              { id: 'file', label: f.tabFile, icon: <Upload size={16} aria-hidden="true" /> },
            ]}
            activeTab={mode}
            onChange={(id) => switchMode(id as 'url' | 'file')}
          />

          {mode === 'url' ? (
            <InputField
              label={f.linkLabel}
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

          <CampaignPicker campaigns={campaigns} error={campaignsError} value={campaignIds} onChange={setCampaignIds} />

          <div className="mc-stack mc-gap-8">
            <ToggleSwitch checked={smartChecked} onChange={setSmartChoice} label={f.smart.label} hint={smartHint} />
            {smartChoice !== null && (
              <div>
                <Button variant="ghost" size="sm" icon={<RotateCcw size={14} aria-hidden="true" />} onClick={() => setSmartChoice(null)}>
                  {f.smart.follow}
                </Button>
              </div>
            )}
          </div>

          <Field label={f.choose.label} hint={pick === 'manual' ? f.choose.manualHint : f.choose.aiHint}>
            <ChoiceChips
              ariaLabel={f.choose.label}
              options={[
                { value: 'ai', label: f.choose.ai },
                { value: 'manual', label: f.choose.manual },
              ]}
              value={pick}
              onChange={(v) => {
                setPick(v as 'ai' | 'manual')
                setFormError(null)
              }}
            />
          </Field>

          {pick === 'manual' && (
            <div className="mc-stack mc-gap-16">
              <MomentsEditor rows={moments} onChange={setMoments} showErrors={showMomentErrors} />
              <ToggleSwitch checked={snapEdges} onChange={setSnapEdges} label={f.moments.snap} hint={f.moments.snapHint} />
            </div>
          )}

          {pick === 'ai' && (
            <div className="mc-stack mc-gap-12">
              <Field label={f.duration} hint={duration !== CUSTOM && durationKind ? f.durationHint(durationKind) : undefined}>
                <ChoiceChips
                  ariaLabel={f.duration}
                  options={[...choices.map(({ value, label }) => ({ value, label })), { value: CUSTOM, label: f.custom }]}
                  value={duration}
                  onChange={setDuration}
                />
              </Field>
              {duration === CUSTOM && (
                <div className="mc-stack mc-gap-8">
                  <div className="mc-row mc-row--wrap mc-gap-12" style={{ alignItems: 'flex-start' }}>
                    <InputField
                      type="number"
                      label={f.customFrom}
                      value={customLo}
                      min={CUSTOM_DURATION.min}
                      max={CUSTOM_DURATION.max - CUSTOM_DURATION.span}
                      onChange={(e) => setCustomLo(e.target.value)}
                      aria-invalid={!customValid || undefined}
                      mono
                      containerStyle={NUMBER_FIELD}
                    />
                    <InputField
                      type="number"
                      label={f.customTo}
                      value={customHi}
                      min={CUSTOM_DURATION.min + CUSTOM_DURATION.span}
                      max={CUSTOM_DURATION.max}
                      onChange={(e) => setCustomHi(e.target.value)}
                      aria-invalid={!customValid || undefined}
                      mono
                      containerStyle={NUMBER_FIELD}
                    />
                  </div>
                  <span className={customValid ? 'mc-field__hint' : 'mc-field__error'} role={customValid ? undefined : 'alert'}>
                    {f.customHint(CUSTOM_DURATION.min, CUSTOM_DURATION.max, CUSTOM_DURATION.span)}
                  </span>
                </div>
              )}
              {bounds?.conflict ? (
                <Alert tone="warning">{b.picker.durationConflict(bounds.min ?? 0, bounds.max ?? 0)}</Alert>
              ) : (
                bounds &&
                suggestion && (
                  <Alert
                    tone="info"
                    action={
                      <Button variant="secondary" size="sm" onClick={() => applySuggestion(suggestion)}>
                        {b.picker.durationUse(b.seconds(suggestion[0], suggestion[1]))}
                      </Button>
                    }
                  >
                    {b.picker.durationAsk(b.range(bounds.min, bounds.max))} {b.picker.durationWhy}
                  </Alert>
                )
              )}
            </div>
          )}

          {pick === 'ai' && (
            <TextAreaField
              label={f.note}
              hint={f.noteHint}
              placeholder={f.notePlaceholder}
              value={note}
              maxLength={2000}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
            />
          )}

          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="mc-row mc-row--between mc-row--wrap mc-gap-16" style={{ alignItems: 'flex-end' }}>
            {pick === 'ai' ? (
              <NumberStepper
                label={f.maxClips}
                hint={chosen.length > 1 ? b.picker.perCampaign : undefined}
                value={maxClips}
                onChange={setMaxClips}
                min={0}
                max={100}
                format={(n) => (n === 0 ? f.unlimited : String(n))}
              />
            ) : (
              <span />
            )}
            <Button type="submit" variant="primary" size="lg" loading={submitting} icon={<Clapperboard size={18} aria-hidden="true" />}>
              {pick === 'manual' ? f.moments.submit : f.start}
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
  const t = useT()
  const p = t.discover.progress
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
      setLoadError(errorMessage(err, tm().discover.progress.notFound))
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
      // A completed job waits for the fresh document: its failed_clips decide whether to leave for the gallery
      if (e.status !== 'completed') setJob((prev) => (prev ? { ...prev, status: e.status } : prev))
      if (e.error) setLiveMessage(e.error)
      load()
    }
  })

  // Completed -> go to the clips gallery (unless some clips failed: the user can retry them here)
  useEffect(() => {
    if (job?.status !== 'completed' || job.failed_clips > 0) return
    toast.success(tm().discover.progress.completed)
    const timer = setTimeout(() => router.push('/clips/'), 1500)
    return () => clearTimeout(timer)
  }, [job?.status, job?.failed_clips, router])

  const cancel = async () => {
    setBusy(true)
    try {
      const { job } = await api.jobs.cancel(jobId)
      setJob(job)
      setConfirmCancel(false)
      toast.success(p.cancelled)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const resume = async () => {
    setBusy(true)
    try {
      const retrying = job?.status === 'completed'
      const { job: resumed } = await api.jobs.resume(jobId)
      setJob(resumed)
      setLiveMessage(null)
      toast.success(retrying ? tm().jobs.retryStarted : p.resumed)
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
        title={p.loadFailed}
        action={
          <Button variant="secondary" size="sm" onClick={() => router.push('/discover/')}>
            {t.common.back}
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
    return { id: step.id, label: `${t.jobs.stepShort[step.id]}${count}`, state }
  })

  return (
    <Card padding="lg">
      <div className="mc-stack mc-gap-24">
        <div className="mc-row mc-row--between mc-row--top mc-row--wrap mc-gap-16">
          <div className="mc-stack mc-gap-8 mc-grow">
            <div className="mc-row mc-row--wrap">
              <h2 className="mc-h2">{active ? p.running : job.status === 'completed' ? p.done : p.stopped}</h2>
              <StatusBadge kind="job" status={job.status} />
            </div>
            <p className="mc-caption mc-muted" style={{ wordBreak: 'break-all' }}>
              {source.label}: {source.text} · {p.startedAt(formatDateTime(job.started_at || job.created_at))}
            </p>
          </div>
          <div className="mc-row mc-row--wrap mc-gap-8">
            {active && (
              <Button variant="danger" size="sm" icon={<X size={16} aria-hidden="true" />} onClick={() => setConfirmCancel(true)}>
                {p.cancel}
              </Button>
            )}
            {RESUMABLE_JOB_STATUSES.includes(job.status) && (
              <Button variant="primary" size="sm" icon={<RotateCcw size={16} aria-hidden="true" />} onClick={resume} loading={busy}>
                {p.resume}
              </Button>
            )}
            {job.status === 'completed' && job.failed_clips > 0 && (
              <>
                <Button variant="primary" size="sm" icon={<RotateCcw size={16} aria-hidden="true" />} onClick={resume} loading={busy}>
                  {t.jobs.retryFailed(job.failed_clips)}
                </Button>
                <ButtonLink href="/clips/" variant="secondary" size="sm">
                  {p.viewClips}
                </ButtonLink>
              </>
            )}
            <ButtonLink href={QUEUE_HREF} variant="secondary" size="sm" icon={<ListChecks size={16} aria-hidden="true" />}>
              {t.clips.tabs.queue}
            </ButtonLink>
          </div>
        </div>

        <div className="mc-stack mc-gap-8">
          <ProgressBar value={job.progress_pct} label={t.jobs.progressLabel} showValue />
          {job.total_scenes > 0 && (
            <span className="mc-caption mc-muted">
              {p.clipsProcessed} <span className="mc-mono">{job.processed_scenes}/{job.total_scenes}</span>
            </span>
          )}
        </div>

        <div className="mc-stack mc-gap-12">
          <PipelineSteps steps={steps} />
          {active && <p className="mc-muted">{jobStepLabel(job.current_step)}</p>}
          {job.status === 'completed' && job.failed_clips > 0 && (
            <p className="mc-muted">{p.partial(job.failed_clips, job.total_scenes)}</p>
          )}
          {(liveMessage || job.activity?.message) && active && (
            <p className="mc-caption mc-mono mc-muted" style={{ wordBreak: 'break-word' }}>
              › {liveMessage || job.activity?.message}
            </p>
          )}
        </div>

        {job.errors.length > 0 && (
          <Alert tone="error" title={p.errors(job.errors.length)}>
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
        title={p.cancelModal.title}
        message={p.cancelModal.message}
        confirmLabel={p.cancelModal.confirm}
        danger
        loading={busy}
        onConfirm={cancel}
        onClose={() => setConfirmCancel(false)}
      />
    </Card>
  )
}
