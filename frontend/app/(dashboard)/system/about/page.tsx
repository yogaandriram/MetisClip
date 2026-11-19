'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Copy, FolderOpen, LifeBuoy, ScrollText, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Badge, Button, Card, CardHeader, PageHeader, Skeleton } from '@/components/ui'
import { LogoMark } from '@/components/ui/Logo'
import { useEngine } from '@/contexts/EngineContext'
import { api, type Settings, type StorageInfo, type SystemCheck } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { isDesktop } from '@/lib/media'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { supportText } from '@/lib/supportInfo'

const headerIcon = (Icon: React.ElementType) => <Icon size={18} aria-hidden="true" />

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
                <LogoMark size={26} />
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
          <Card>
            <CardHeader size="sm" icon={headerIcon(RefreshCw)} title={m.update.title} />
            <p className="mc-muted" style={{ margin: 0 }}>
              {m.update.body}
            </p>
          </Card>

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
        </div>
      </div>
    </>
  )
}
