'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Copy, ExternalLink, FolderOpen, LifeBuoy, RefreshCw, Scale, ScrollText } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, PageHeader, ProgressBar, Skeleton } from '@/components/ui'
import { LogoMark } from '@/components/ui/Logo'
import { useEngine } from '@/contexts/EngineContext'
import { api, type Settings, type StorageInfo, type SystemCheck } from '@/lib/engine'
import { errorMessage, formatBytes, formatDateTime } from '@/lib/format'
import { isDesktop } from '@/lib/media'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { supportText } from '@/lib/supportInfo'
import { useUpdateStatus } from '@/lib/updates'

const headerIcon = (Icon: React.ElementType) => <Icon size={18} aria-hidden="true" />

/** The update card: what the updater does now, "Periksa sekarang", and "Mulai ulang dan pasang" (§10.4). */
function UpdateCard() {
  const m = useI18n().t.about.update
  const status = useUpdateStatus()
  const [installing, setInstalling] = useState(false)

  if (!window.metis) return null
  if (!status) return <Skeleton height={120} radius="md" />

  const checked = status.checkedAt ? m.checkedAt(formatDateTime(status.checkedAt)) : m.never
  const phase = status.phase
  const busy = phase === 'checking' || phase === 'downloading'

  const check = () => {
    window.metis!.checkForUpdates().catch((err) => toast.error(errorMessage(err, m.errors.other)))
  }
  const install = async () => {
    setInstalling(true)
    try {
      await window.metis!.installUpdate()
    } catch (err) {
      toast.error(errorMessage(err, m.failed))
    } finally {
      setInstalling(false)
    }
  }
  const openNotes = () => {
    if (status.releaseUrl) window.metis!.openExternal(status.releaseUrl).catch(() => undefined)
  }

  return (
    <Card>
      <CardHeader size="sm" icon={headerIcon(RefreshCw)} title={m.title} />
      <div className="mc-stack mc-gap-12">
        {phase === 'unsupported' && (
          <p className="mc-muted" style={{ margin: 0 }}>
            {m.dev}
          </p>
        )}
        {(phase === 'idle' || phase === 'latest') && (
          <p style={{ margin: 0 }}>
            {phase === 'latest' ? `${m.latest} ` : ''}
            <span className="mc-muted">{checked}</span>
          </p>
        )}
        {phase === 'checking' && (
          <p className="mc-muted" style={{ margin: 0 }}>
            {m.checking}
          </p>
        )}
        {phase === 'downloading' && status.version && (
          <div className="mc-stack mc-gap-8">
            <p style={{ margin: 0 }}>{m.downloading(status.version)}</p>
            <ProgressBar value={status.percent} showValue label={status.total ? m.downloaded(formatBytes(status.transferred ?? 0), formatBytes(status.total)) : m.title} />
          </div>
        )}
        {phase === 'ready' && status.version && <p style={{ margin: 0 }}>{m.ready(status.version)}</p>}
        {phase === 'error' && status.error && (
          <Alert tone="info" title={m.errors[status.error.kind]}>
            <span className="mc-caption">{status.error.detail}</span>
          </Alert>
        )}
        {phase !== 'unsupported' && !status.auto && (
          <p className="mc-caption mc-muted" style={{ margin: 0 }}>
            {m.autoOff}
          </p>
        )}
        {phase !== 'unsupported' && (
          <p className="mc-caption mc-muted" style={{ margin: 0 }}>
            {m.keepsData}
          </p>
        )}
        {phase !== 'unsupported' && (
          <div className="mc-row mc-row--wrap mc-gap-8">
            {phase === 'ready' ? (
              <Button variant="primary" size="sm" onClick={install} loading={installing}>
                {m.restart}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={check} loading={busy} disabled={busy}>
                {phase === 'error' ? m.retry : m.check}
              </Button>
            )}
            {status.releaseUrl && (phase === 'ready' || phase === 'downloading') && (
              <Button variant="ghost" size="sm" icon={<ExternalLink size={16} aria-hidden="true" />} onClick={openNotes}>
                {m.notes}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

/** Tentang MetisClip (§9.2): version, release notes, update status, and the info to copy for support (§10.5). */
export default function AboutPage() {
  const { t, lang } = useI18n()
  const m = t.about
  const { systemInfo } = useEngine()
  const desktop = isDesktop()
  const [check, setCheck] = useState<SystemCheck | null>(null)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    // Each part is optional: whatever loads still goes into the text
    const [c, s, st] = await Promise.allSettled([api.system.check(), api.system.storage(), api.settings.get()])
    if (c.status === 'fulfilled') setCheck(c.value)
    if (s.status === 'fulfilled') setStorage(s.value)
    if (st.status === 'fulfilled') setSettings(st.value.settings)
    const failed = [c, s, st].find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed) setLoadError(errorMessage(failed.reason))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const text = supportText({ t, lang, systemInfo, check, storage, settings })
  const version = desktop ? window.metis!.appVersion : systemInfo?.version || '-'
  const packaged = desktop ? window.metis!.isPackaged : systemInfo?.env !== 'dev'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(m.support.copied)
    } catch (err) {
      toast.error(`${m.support.copyFailed}: ${errorMessage(err)}`)
    }
  }

  const openLogs = async () => {
    if (!systemInfo?.logs_dir || !window.metis) return
    const r = await window.metis.openPath(systemInfo.logs_dir)
    if (!r.ok) toast.error(r.error || t.system.folderOpenFailed)
  }

  return (
    <>
      <PageHeader title={m.title} subtitle={m.subtitle} back={{ href: '/system/', label: m.back }} />

      <div className="mc-grid" style={{ alignItems: 'start' }}>
        <div className="mc-col-7 mc-stack mc-gap-20">
          <Card tone="leaf">
            <div className="mc-row mc-gap-16" style={{ alignItems: 'center' }}>
              <span className="mc-logo" aria-hidden="true">
                <LogoMark size={42} />
              </span>
              <div className="mc-stack mc-gap-4" style={{ minWidth: 0 }}>
                <div className="mc-row mc-row--wrap mc-gap-8" style={{ alignItems: 'center' }}>
                  <h2 className="mc-h3" style={{ margin: 0 }}>
                    MetisClip
                  </h2>
                  <Badge tone="neutral" size="sm">
                    {m.version(version)}
                  </Badge>
                  <Badge tone="neutral" size="sm">
                    {packaged ? m.buildInstalled : m.buildDev}
                  </Badge>
                </div>
                <p className="mc-muted" style={{ margin: 0 }}>
                  {m.tagline}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader size="sm" icon={headerIcon(ScrollText)} title={m.notes.title} />
            <div className="mc-stack mc-gap-20">
              {m.notes.releases.map((release) => (
                <section key={release.version} className="mc-stack mc-gap-8">
                  <div className="mc-row mc-gap-8" style={{ alignItems: 'baseline' }}>
                    <span className="mc-mono mc-label">{release.version}</span>
                    <span className="mc-label">{release.title}</span>
                  </div>
                  <ul className="mc-notes">
                    {release.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>
        </div>

        <div className="mc-col-5 mc-stack mc-gap-20">
          {desktop && <UpdateCard />}

          <Card>
            <CardHeader size="sm" icon={headerIcon(LifeBuoy)} title={m.support.title} />
            <div className="mc-stack mc-gap-12">
              <p className="mc-caption mc-muted" style={{ margin: 0 }}>
                {m.support.hint}
              </p>
              {loadError && (
                <Alert tone="info" title={m.support.loadFailed}>
                  {loadError}
                </Alert>
              )}
              {loading ? <Skeleton height={260} radius="md" /> : <pre className="mc-codebox">{text}</pre>}
              <div className="mc-row mc-row--wrap mc-gap-8">
                <Button variant="primary" size="sm" icon={<Copy size={16} aria-hidden="true" />} onClick={copy} disabled={loading}>
                  {m.support.copy}
                </Button>
                {desktop && systemInfo && (
                  <Button variant="secondary" size="sm" icon={<FolderOpen size={16} aria-hidden="true" />} onClick={openLogs}>
                    {m.support.openLogs}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader size="sm" icon={headerIcon(Scale)} title={m.licenses.cardTitle} />
            <div className="mc-stack mc-gap-12">
              <p className="mc-muted" style={{ margin: 0 }}>
                {m.licenses.cardText}
              </p>
              <div>
                <ButtonLink href="/system/licenses/" variant="secondary" size="sm" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
                  {m.licenses.open}
                </ButtonLink>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
