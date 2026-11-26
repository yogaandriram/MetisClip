'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, Info, Search, X } from 'lucide-react'
import { Alert, Badge, Button, Card, CardHeader, IconButton, InputField, PageHeader, Skeleton } from '@/components/ui'
import { buttonClass } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n/I18nProvider'

/** frontend/public/third-party/licenses.json, written by scripts/gen-licenses.py from what the build ships */
type GroupId = 'programs' | 'engine' | 'ui' | 'render' | 'desktop'
type NoteKey = 'ffmpeg' | 'electron' | 'remotion_ffmpeg' | 'fdk_aac' | 'remotion_compositor'
interface LicenseComponent {
  name: string
  version: string
  license: string
  url: string
  texts: string[]
  note?: NoteKey
}
interface LicenseList {
  version: number
  app: { name: string; license: string; text: string }
  groups: { id: GroupId; title: string; components: LicenseComponent[] }[]
  texts: Record<string, string>
}

/** Case and accents ignored, like the help search */
const fold = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function Website({ url, label }: { url: string; label: string }) {
  if (!/^https?:\/\//.test(url)) return null
  const icon = <ExternalLink size={16} aria-hidden="true" />
  if (window.metis) {
    return (
      <Button variant="secondary" size="sm" icon={icon} onClick={() => window.metis!.openExternal(url).catch(() => undefined)}>
        {label}
      </Button>
    )
  }
  return (
    <a className={buttonClass({ variant: 'secondary', size: 'sm' })} href={url} target="_blank" rel="noreferrer">
      {icon}
      <span>{label}</span>
    </a>
  )
}

/** One component: its name, version and license; opened, its note, website and license texts. */
function ComponentRow({ c, texts }: { c: LicenseComponent; texts: Record<string, string> }) {
  const m = useI18n().t.about.licenses
  const [open, setOpen] = useState(false)
  return (
    <details className="mc-help-topic" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="mc-row mc-row--wrap mc-gap-8" style={{ alignItems: 'baseline', minWidth: 0 }}>
          <span style={{ overflowWrap: 'anywhere' }}>{c.name}</span>
          {c.version && <span className="mc-mono mc-caption mc-muted">{c.version}</span>}
        </span>
        <span className="mc-row mc-gap-8" style={{ alignItems: 'center', flexShrink: 0 }}>
          <Badge tone="neutral" size="sm">
            {c.license || m.noLicenseName}
          </Badge>
          <ChevronDown size={18} className="mc-help-topic__chevron" aria-hidden="true" />
        </span>
      </summary>
      {open && (
        <div className="mc-help-topic__body">
          {c.note && <p>{m.notes[c.note]}</p>}
          <Website url={c.url} label={m.website} />
          {c.texts.map((id) => (
            <pre key={id} className="mc-codebox mc-license-text">
              {texts[id]}
            </pre>
          ))}
        </div>
      )}
    </details>
  )
}

/** Lisensi pihak ketiga (Sistem → Tentang): MetisClip's MIT license, notes, and every component the build ships. */
export default function LicensesPage() {
  const m = useI18n().t.about.licenses
  const [list, setList] = useState<LicenseList | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setFailed(null)
    try {
      const res = await fetch('/third-party/licenses.json')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setList((await res.json()) as LicenseList)
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const words = fold(query).split(/\s+/).filter(Boolean)
  const total = list ? list.groups.reduce((n, g) => n + g.components.length, 0) : 0
  const shown = useMemo(() => {
    if (!list) return []
    return list.groups
      .map((g) => ({
        ...g,
        components: words.length
          ? g.components.filter((c) => {
              const text = fold([c.name, c.version, c.license].join(' '))
              return words.every((w) => text.includes(w))
            })
          : g.components,
      }))
      .filter((g) => g.components.length)
    // `words` comes from `query`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, query])
  const shownCount = shown.reduce((n, g) => n + g.components.length, 0)

  return (
    <>
      <PageHeader title={m.title} subtitle={m.subtitle} back={{ href: '/system/about/', label: m.back }} />

      {failed ? (
        <Alert tone="info" title={m.loadFailed} action={<Button variant="secondary" size="sm" onClick={load}>{m.retry}</Button>}>
          <span>{m.loadFailedHint}</span> <span className="mc-caption">({failed})</span>
        </Alert>
      ) : !list ? (
        <Skeleton height={420} radius="md" />
      ) : (
        <div className="mc-grid" style={{ alignItems: 'start' }}>
          <div className="mc-col-8 mc-stack mc-gap-20">
            <div className="mc-stack mc-gap-8">
              <InputField
                aria-label={m.searchLabel}
                placeholder={m.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                icon={<Search size={18} aria-hidden="true" />}
                action={query ? <IconButton size="sm" variant="ghost" label={m.clearSearch} icon={<X size={16} />} onClick={() => setQuery('')} /> : undefined}
              />
              <p className="mc-caption mc-muted" role="status" style={{ margin: 0 }}>
                {shownCount ? m.count(shownCount, total) : m.empty(query.trim())}
              </p>
            </div>

            {shown.map((g) => (
              <Card key={g.id}>
                <CardHeader size="sm" title={m.groups[g.id]} subtitle={m.components(g.components.length)} />
                <div>
                  {g.components.map((c) => (
                    <ComponentRow key={`${c.name}@${c.version}`} c={c} texts={list.texts} />
                  ))}
                </div>
              </Card>
            ))}
          </div>

          <div className="mc-col-4 mc-stack mc-gap-20">
            <Card tone="leaf">
              <CardHeader size="sm" title={list.app.name} subtitle={list.app.license} />
              <div className="mc-stack mc-gap-12">
                <p style={{ margin: 0 }}>{m.appText}</p>
                <details className="mc-help-topic">
                  <summary>
                    <span>{m.appLicense}</span>
                    <ChevronDown size={18} className="mc-help-topic__chevron" aria-hidden="true" />
                  </summary>
                  <div className="mc-help-topic__body">
                    <pre className="mc-codebox mc-license-text">{list.texts[list.app.text]}</pre>
                  </div>
                </details>
              </div>
            </Card>

            <Card>
              <CardHeader size="sm" icon={<Info size={18} aria-hidden="true" />} title={m.notesTitle} />
              <div className="mc-stack mc-gap-12">
                <p style={{ margin: 0 }}>{m.remotion}</p>
                <p style={{ margin: 0 }}>{m.ffmpeg}</p>
                <p style={{ margin: 0 }}>{m.ffmpegRemotion}</p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
