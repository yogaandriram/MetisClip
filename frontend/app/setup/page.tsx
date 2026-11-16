'use client'

import React, { useCallback, useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FolderOpen, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, getEngineInfo, type SecretName, type SystemCheck } from '@/lib/engine'
import { errorMessage, formatBytes } from '@/lib/format'
import { Alert, Badge, Blob, Button, Card, Divider, Field, InputField, LanguageSwitch, Logo, Skeleton, Spinner, WizardSteps } from '@/components/ui'
import { SecretField } from '@/components/settings/SecretField'
import { LlmSection, type LlmValue } from '@/components/settings/LlmFields'
import { rememberActiveCampaign } from '@/contexts/CampaignContext'
import { localeTag } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

const STEPS = ['welcome', 'data', 'keys', 'check', 'campaign'] as const

type StepId = (typeof STEPS)[number]

export default function SetupPage() {
  const t = useT()
  const router = useRouter()
  const [step, setStep] = useState<StepId>('welcome')
  const index = STEPS.indexOf(step)
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)])
  const back = () => setStep(STEPS[Math.max(index - 1, 0)])

  return (
    <main style={{ minHeight: '100vh', padding: '48px 16px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
      <Card padding="lg" style={{ width: '100%', maxWidth: 720, borderRadius: 'var(--r-xl)' }}>
        <div className="mc-stack mc-gap-32">
          <WizardSteps steps={STEPS.map((s) => t.setup.steps[s])} current={index} />
          <div className="mc-stack mc-gap-24">
            {step === 'welcome' && <WelcomeStep onNext={next} />}
            {step === 'data' && <DataStep onNext={next} onBack={back} />}
            {step === 'keys' && <KeysStep onNext={next} onBack={back} />}
            {step === 'check' && <CheckStep onNext={next} onBack={back} />}
            {step === 'campaign' && <CampaignStep onBack={back} onDone={() => router.replace('/dashboard/')} />}
          </div>
        </div>
      </Card>
    </main>
  )
}

function StepTitle({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mc-stack mc-gap-8">
      <h1 className="mc-h1">{title}</h1>
      {subtitle && <p className="mc-body-lg mc-muted">{subtitle}</p>}
    </div>
  )
}

function StepActions({ onBack, children }: { onBack?: () => void; children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="mc-stack mc-gap-20">
      <Divider />
      <div className="mc-row mc-row--between mc-row--wrap">
        <div>
          {onBack && (
            <Button variant="ghost" size="lg" onClick={onBack} icon={<ArrowLeft size={16} aria-hidden="true" />}>
              {t.common.back}
            </Button>
          )}
        </div>
        <div className="mc-row mc-row--wrap">{children}</div>
      </div>
    </div>
  )
}

function StatusLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mc-row mc-gap-8 mc-muted" role="status">
      <Spinner size="sm" />
      {children}
    </div>
  )
}

function HealthBadge({ ok }: { ok: boolean }) {
  const t = useT()
  return ok ? (
    <Badge tone="success" size="sm" icon={<Check size={14} aria-hidden="true" />}>
      {t.system.health.ok}
    </Badge>
  ) : (
    <Badge tone="error" size="sm" icon={<AlertTriangle size={14} aria-hidden="true" />}>
      {t.system.health.problem}
    </Badge>
  )
}

// ---------------------------------------------------------------------------

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const t = useT()
  const m = t.setup.welcome
  const [accepted, setAccepted] = useState(false)
  return (
    <>
      <Card tone="dew" style={{ minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24 }}>
        <Blob />
        <div className="mc-card__body mc-row mc-row--between mc-row--top mc-row--wrap mc-gap-16">
          <Logo />
          {/* First choice of the wizard, so every later step is in the user's language */}
          <LanguageSwitch size="sm" />
        </div>
        <div className="mc-card__body mc-stack mc-gap-4" style={{ maxWidth: '60%' }}>
          <span className="mc-label mc-moss">{m.eyebrow}</span>
          <h1 className="mc-h1">{m.title}</h1>
        </div>
      </Card>
      <p className="mc-body-lg mc-muted">{m.intro}</p>
      <Alert tone="warning" title={m.copyrightTitle}>
        {m.copyrightBody}
      </Alert>
      <label className="mc-row mc-row--top mc-gap-12" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 1 }} />
        <span>{m.accept}</span>
      </label>
      <StepActions>
        <Button variant="primary" size="lg" onClick={onNext} disabled={!accepted} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
          {m.start}
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

function DataStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const t = useT()
  const m = t.setup.data
  const desktop = typeof window !== 'undefined' && !!window.metis
  const pathId = useId()
  const [loading, setLoading] = useState(true)
  const [currentRoot, setCurrentRoot] = useState<string | null>(null)
  const [path, setPath] = useState('')
  const [check, setCheck] = useState<MetisDataRootCheck | null>(null)
  const [validating, setValidating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const validate = useCallback(async (p: string) => {
    if (!window.metis || !p) return
    setValidating(true)
    try {
      setCheck(await window.metis.validateDataRoot(p))
    } catch (err) {
      setCheck(null)
      setError(errorMessage(err))
    } finally {
      setValidating(false)
    }
  }, [])

  useEffect(() => {
    if (!window.metis) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const root = await window.metis!.getDataRoot()
        if (cancelled) return
        setCurrentRoot(root)
        if (!root) {
          const def = await window.metis!.getDefaultDataRoot()
          if (cancelled) return
          setPath(def)
          await validate(def)
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [validate])

  const choose = async () => {
    if (!window.metis) return
    const picked = await window.metis.selectFolder({ title: m.pickDialogTitle, defaultPath: path || undefined })
    if (picked) {
      setPath(picked)
      setError(null)
      await validate(picked)
    }
  }

  const apply = async () => {
    if (!window.metis || !check?.ok) return
    setApplying(true)
    setError(null)
    setStatus(m.preparing)
    const unsubscribe = window.metis.onEngineStatus((s) => {
      if (s.message) setStatus(s.message)
      else if (s.state === 'starting') setStatus(m.startingServices)
    })
    try {
      const res = await window.metis.setDataRoot(check.path)
      if (!res.ok) {
        setError(res.error || m.useFailed)
        return
      }
      setStatus(m.connecting)
      await getEngineInfo()
      await api.health()
      toast.success(m.ready)
      onNext()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      unsubscribe()
      setApplying(false)
      setStatus(null)
    }
  }

  const continueExisting = async () => {
    setApplying(true)
    setError(null)
    setStatus(m.connecting)
    try {
      await getEngineInfo()
      await api.health()
      onNext()
    } catch (err) {
      setError(
        window.metis
          ? errorMessage(err)
          : `${errorMessage(err)}. ${m.devManualHint}`
      )
    } finally {
      setApplying(false)
      setStatus(null)
    }
  }

  if (loading) {
    return (
      <>
        <StepTitle title={m.title} />
        <div className="mc-stack mc-gap-12">
          <Skeleton height={44} radius="full" />
          <Skeleton height={80} radius="md" />
        </div>
      </>
    )
  }

  if (!desktop) {
    return (
      <>
        <StepTitle title={m.title} subtitle={m.browserSubtitle} />
        <Alert tone="info">
          {m.browserNoticeBefore} <code className="mc-mono">METISCLIP_DATA_ROOT</code> {m.browserNoticeAfter}
        </Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <StepActions onBack={onBack}>
          <Button variant="primary" size="lg" onClick={continueExisting} loading={applying} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
            {m.continueDev}
          </Button>
        </StepActions>
      </>
    )
  }

  if (currentRoot) {
    return (
      <>
        <StepTitle title={m.title} subtitle={m.alreadySet} />
        <InputField
          label={m.folder}
          hint={m.moveLaterHint}
          readOnly
          mono
          value={currentRoot}
          icon={<FolderOpen size={18} aria-hidden="true" />}
        />
        {status && <StatusLine>{status}</StatusLine>}
        {error && <Alert tone="error">{error}</Alert>}
        <StepActions onBack={onBack}>
          <Button variant="primary" size="lg" onClick={continueExisting} loading={applying} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
            {t.common.next}
          </Button>
        </StepActions>
      </>
    )
  }

  return (
    <>
      <StepTitle
        title={m.chooseTitle}
        subtitle={m.chooseSubtitle}
      />
      <Field label={m.folder} htmlFor={pathId}>
        <div className="mc-row mc-gap-8">
          <InputField id={pathId} readOnly mono value={path} placeholder="-" containerClassName="mc-grow" />
          <Button variant="secondary" onClick={choose} disabled={applying} icon={<FolderOpen size={16} aria-hidden="true" />}>
            {m.chooseFolder}
          </Button>
        </div>
      </Field>

      {validating ? (
        <Skeleton height={60} radius="md" />
      ) : (
        check && (
          <div className="mc-stack mc-gap-12">
            <p>
              <span className="mc-muted">{m.freeSpace} </span>
              <span className="mc-label">{formatBytes(check.freeBytes)}</span>
              <span className="mc-muted"> {m.ofTotal(formatBytes(check.totalBytes))}</span>
            </p>
            {check.problems.map((p) => (
              <Alert key={p} tone="error">
                {p}
              </Alert>
            ))}
            {check.warnings.map((w) => (
              <Alert key={w} tone="warning">
                {w}
              </Alert>
            ))}
            {check.existingData && <Alert tone="success">{m.existing}</Alert>}
            {check.ok && !check.existingData && check.problems.length === 0 && <Alert tone="info">{m.willCreate}</Alert>}
          </div>
        )
      )}

      {status && <StatusLine>{status}</StatusLine>}
      {error && <Alert tone="error">{error}</Alert>}
      <StepActions onBack={applying ? undefined : onBack}>
        <Button variant="primary" size="lg" onClick={apply} loading={applying} disabled={!check?.ok || validating} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
          {m.use}
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

/** Secrets asked for in the wizard besides the LLM key (label and description from `setup.keys`) */
const SECRETS: SecretName[] = ['groq_api_key']

function KeysStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const t = useT()
  const m = t.setup.keys
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState<Record<SecretName, boolean> | null>(null)
  const [values, setValues] = useState<Partial<Record<SecretName, string>>>({})
  const [llm, setLlm] = useState<LlmValue | null>(null)
  const [savedLlm, setSavedLlm] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, st] = await Promise.all([api.secrets.status(), api.settings.get()])
      setConfigured(s.secrets)
      setLlm(st.settings.llm)
      setSavedLlm(JSON.stringify(st.settings.llm))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saveLlm = async () => {
    if (!llm || JSON.stringify(llm) === savedLlm) return
    const { settings } = await api.settings.update({ llm })
    setSavedLlm(JSON.stringify(settings.llm))
  }

  const saveAndNext = async () => {
    setSaving(true)
    try {
      await saveLlm()
      for (const name of SECRETS) {
        const v = (values[name] || '').trim()
        if (v) await api.secrets.set(name, v)
      }
      onNext()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading || (!error && (!llm || !configured))) {
    return (
      <>
        <StepTitle title={m.title} />
        <div className="mc-stack">
          <Skeleton height={70} radius="md" />
          <Skeleton height={70} radius="md" />
          <Skeleton height={70} radius="md" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <StepTitle title={m.title} />
        <Alert tone="error">{error}</Alert>
        <StepActions onBack={onBack}>
          <Button variant="secondary" size="lg" onClick={load} icon={<RefreshCw size={16} aria-hidden="true" />}>
            {t.common.retry}
          </Button>
        </StepActions>
      </>
    )
  }

  return (
    <>
      <StepTitle
        title={m.heading}
        subtitle={m.subtitle}
      />
      <LlmSection
        value={llm!}
        onChange={setLlm}
        secrets={configured!}
        onSecretConfigured={(name, c) => setConfigured((prev) => (prev ? { ...prev, [name]: c } : prev))}
        persist={saveLlm}
        allowRemove={false}
      />
      <Divider />
      <h2 className="mc-h3">{m.transcription}</h2>
      {SECRETS.map((name) => (
        <SecretField
          key={name}
          name={name}
          label={m.groqLabel}
          description={m.groqDescription}
          configured={configured![name]}
          value={values[name] || ''}
          onChange={(v) => setValues((prev) => ({ ...prev, [name]: v }))}
          onConfiguredChange={(c) => setConfigured((prev) => (prev ? { ...prev, [name]: c } : prev))}
          allowRemove={false}
        />
      ))}
      <StepActions onBack={onBack}>
        <Button variant="secondary" size="lg" onClick={onNext} disabled={saving}>
          {m.skip}
        </Button>
        <Button variant="primary" size="lg" onClick={saveAndNext} loading={saving} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
          {m.saveNext}
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

function CheckStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const t = useT()
  const m = t.setup.check
  const c = t.system.check
  const [check, setCheck] = useState<SystemCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCheck(await api.system.check())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    run()
  }, [run])

  const failed = check?.items.filter((i) => !i.ok).length || 0

  return (
    <>
      <StepTitle title={m.title} subtitle={m.subtitle} />
      {loading ? (
        <div className="mc-stack mc-gap-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={48} radius="md" />
          ))}
        </div>
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
        check && (
          <div className="mc-stack mc-gap-20">
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th scope="col">{c.component}</th>
                    <th scope="col">{c.version}</th>
                    <th scope="col">{c.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {check.items.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <div className="mc-label">{item.label}</div>
                        {item.detail && (
                          <div className="mc-caption mc-muted" style={{ overflowWrap: 'anywhere' }}>
                            {item.detail}
                          </div>
                        )}
                      </td>
                      <td className="mc-mono mc-caption">{item.version || '-'}</td>
                      <td>
                        <HealthBadge ok={item.ok} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mc-row mc-row--wrap mc-gap-8">
              <Badge tone="neutral" size="sm">
                {c.cpuCores(check.cpu_count)}
              </Badge>
              <Badge tone="neutral" size="sm">
                {c.ram(check.ram_gb.toLocaleString(localeTag(), { maximumFractionDigits: 1 }))}
              </Badge>
              <Badge tone="neutral" size="sm">
                {c.encoders(check.encoders.length ? check.encoders.join(', ') : 'libx264')}
              </Badge>
            </div>
            {failed > 0 && (
              <Alert tone="warning">{m.problems(failed)}</Alert>
            )}
          </div>
        )
      )}
      <StepActions onBack={onBack}>
        <Button variant="secondary" size="lg" onClick={run} loading={loading} icon={<RefreshCw size={16} aria-hidden="true" />}>
          {c.recheck}
        </Button>
        <Button variant="primary" size="lg" onClick={onNext} disabled={loading} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
          {t.common.next}
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

function CampaignStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const t = useT()
  const m = t.setup.campaign
  const c = t.campaign.createDialog
  const [existing, setExisting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.campaigns
      .list()
      .then(({ campaigns }) => {
        setExisting(campaigns.length)
        setShowForm(campaigns.length === 0)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const create = async () => {
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      const { campaign } = await api.campaigns.create({ name: name.trim(), client: client.trim() })
      rememberActiveCampaign(campaign.id)
      toast.success(m.created(campaign.name))
      onDone()
    } catch (err) {
      toast.error(errorMessage(err, c.failed))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <StepTitle title={m.title} subtitle={m.subtitle} />
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : existing === null ? (
        <Skeleton height={160} radius="md" />
      ) : (
        <>
          {existing > 0 && <Alert tone="success">{m.existing(existing)}</Alert>}
          {showForm ? (
            <form
              className="mc-stack"
              onSubmit={(e) => {
                e.preventDefault()
                create()
              }}
            >
              <InputField
                label={c.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder={c.namePlaceholder}
                hint={c.hint}
                autoFocus
              />
              <InputField label={c.client} value={client} onChange={(e) => setClient(e.target.value)} maxLength={80} placeholder={c.clientPlaceholder} />
              <div className="mc-row mc-gap-8">
                <Button type="submit" variant="primary" loading={creating} disabled={!name.trim()}>
                  {m.createStart}
                </Button>
                {existing > 0 && (
                  <Button variant="ghost" onClick={() => setShowForm(false)} disabled={creating}>
                    {t.common.cancel}
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <div>
              <Button variant="secondary" onClick={() => setShowForm(true)} icon={<Plus size={16} aria-hidden="true" />}>
                {m.createNew}
              </Button>
            </div>
          )}
        </>
      )}
      <StepActions onBack={onBack}>
        {existing !== null && existing > 0 && (
          <Button variant="primary" size="lg" onClick={onDone} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
            {m.goHome}
          </Button>
        )}
      </StepActions>
    </>
  )
}
