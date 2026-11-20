'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, ChevronDown, Clapperboard, Database, Film, FolderOpen, Keyboard, LifeBuoy, ListChecks, Megaphone, Search, Wrench, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, ButtonLink, Card, CardHeader, IconButton, InputField, Kbd, KeyValueList, PageHeader, Skeleton } from '@/components/ui'
import { FIRST_STEPS, FirstSteps, firstStepsDone, type FirstStepsState } from '@/components/help/FirstSteps'
import { useShell } from '@/components/shell/ShellContext'
import { useCampaign } from '@/contexts/CampaignContext'
import { useEngine } from '@/contexts/EngineContext'
import { api } from '@/lib/engine'
import { providerInfo } from '@/lib/llmProviders'
import { isDesktop } from '@/lib/media'
import { QUEUE_HREF } from '@/lib/routes'
import { editorShortcuts } from '@/lib/shortcuts'
import type { Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

type HelpMessages = Messages['help']
type TopicId = keyof HelpMessages['topics']
type LinkId = keyof HelpMessages['links']

const LINKS: Record<LinkId, string> = {
  discover: '/discover/',
  queue: QUEUE_HREF,
  clips: '/clips/',
  campaigns: '/campaigns/',
  brand: '/brand-template/',
  settings: '/settings/',
  system: '/system/',
  about: '/system/about/',
}

/** The topics by group, with the pages each answer points to. `?topic=<id>` opens one. */
const GROUPS: { id: keyof HelpMessages['groups']; icon: LucideIcon; topics: { id: TopicId; links?: LinkId[] }[] }[] = [
  {
    id: 'start',
    icon: Clapperboard,
    topics: [
      { id: 'how', links: ['discover'] },
      { id: 'sources', links: ['discover'] },
      { id: 'manual', links: ['discover'] },
      { id: 'again', links: ['queue'] },
      { id: 'time', links: ['queue', 'settings'] },
    ],
  },
  {
    id: 'campaign',
    icon: Megaphone,
    topics: [
      { id: 'campaign', links: ['campaigns'] },
      { id: 'brief', links: ['campaigns'] },
      { id: 'template', links: ['brand'] },
    ],
  },
  {
    id: 'edit',
    icon: Film,
    topics: [
      { id: 'words', links: ['clips'] },
      { id: 'export', links: ['clips', 'settings'] },
      { id: 'post', links: ['clips'] },
      { id: 'formats', links: ['settings'] },
    ],
  },
  {
    id: 'trouble',
    icon: Wrench,
    topics: [
      { id: 'youtube', links: ['system', 'settings'] },
      { id: 'ai', links: ['settings', 'queue'] },
      { id: 'slow', links: ['settings'] },
      { id: 'stopped', links: ['queue'] },
      { id: 'disk', links: ['system'] },
      { id: 'report', links: ['about'] },
    ],
  },
  {
    id: 'data',
    icon: Database,
    topics: [{ id: 'where', links: ['system'] }, { id: 'privacy', links: ['settings'] }, { id: 'rights' }],
  },
]

const ALL_TOPICS = GROUPS.flatMap((g) => g.topics.map((t) => t.id))

/** Case and accents ignored, like the gallery search */
const fold = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Bantuan (gap analysis B11): the first steps, topics with a search, shortcuts, and where to get more help. */
export default function HelpPage() {
  const t = useT()
  const m = t.help
  const shell = useShell()
  const { campaigns } = useCampaign()
  const { epoch, systemInfo } = useEngine()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<TopicId>>(new Set())
  const [steps, setSteps] = useState<FirstStepsState | null>(null)

  // `?topic=<id>`: open that topic and scroll to it
  useEffect(() => {
    const topic = new URLSearchParams(window.location.search).get('topic') as TopicId | null
    if (!topic || !ALL_TOPICS.includes(topic)) return
    setOpen(new Set([topic]))
    const timer = window.setTimeout(() => document.getElementById(`topic-${topic}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    Promise.all([api.dashboard.stats(), api.secrets.status(), api.settings.get()])
      .then(([stats, { secrets }, { settings }]) => {
        const ai = !!secrets[providerInfo(settings.llm.provider).secret]
        setSteps({ campaign: true, ai, ...stats.firstSteps })
      })
      .catch(() => setSteps(null))
  }, [epoch])

  const state = steps ? { ...steps, campaign: campaigns.length > 0 } : null

  const words = fold(query).split(/\s+/).filter(Boolean)
  const matches = useMemo(() => {
    if (!words.length) return null
    return new Set(
      GROUPS.flatMap((g) =>
        g.topics
          .filter(({ id }) => {
            const topic = m.topics[id]
            const text = fold([m.groups[g.id], topic.q, ...topic.a].join(' '))
            return words.every((w) => text.includes(w))
          })
          .map((topic) => topic.id)
      )
    )
    // `words` comes from `query`; the dictionary changes with the language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, m])

  // While searching, every matching topic is open
  useEffect(() => {
    if (matches) setOpen(new Set(matches))
  }, [matches])

  const toggle = (id: TopicId, isOpen: boolean) =>
    setOpen((prev) => {
      if (prev.has(id) === isOpen) return prev
      const next = new Set(prev)
      if (isOpen) next.add(id)
      else next.delete(id)
      return next
    })

  const openLogs = async () => {
    if (!systemInfo?.logs_dir || !window.metis) return
    const r = await window.metis.openPath(systemInfo.logs_dir)
    if (!r.ok) toast.error(r.error || t.system.folderOpenFailed)
  }

  const shown = GROUPS.map((g) => ({ ...g, topics: g.topics.filter((topic) => !matches || matches.has(topic.id)) })).filter((g) => g.topics.length)

  return (
    <>
      <PageHeader title={m.title} subtitle={m.subtitle} />

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
            {matches && (
              <p className="mc-caption mc-muted" role="status" style={{ margin: 0 }}>
                {matches.size ? m.searchCount(matches.size) : m.searchEmpty(query.trim())}
              </p>
            )}
          </div>

          {shown.map((group) => {
            const Icon = group.icon
            return (
              <Card key={group.id}>
                <CardHeader size="sm" icon={<Icon size={18} aria-hidden="true" />} title={m.groups[group.id]} />
                <div>
                  {group.topics.map(({ id, links }) => {
                    const topic = m.topics[id]
                    return (
                      <details
                        key={id}
                        id={`topic-${id}`}
                        className="mc-help-topic"
                        open={open.has(id)}
                        onToggle={(e) => toggle(id, (e.currentTarget as HTMLDetailsElement).open)}
                      >
                        <summary>
                          <span>{topic.q}</span>
                          <ChevronDown size={18} className="mc-help-topic__chevron" aria-hidden="true" />
                        </summary>
                        <div className="mc-help-topic__body">
                          {topic.a.map((paragraph) => (
                            <p key={paragraph}>{paragraph}</p>
                          ))}
                          {links && (
                            <div className="mc-row mc-row--wrap mc-gap-8">
                              {links.map((link) => (
                                <ButtonLink key={link} href={LINKS[link]} variant="secondary" size="sm" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
                                  {m.links[link]}
                                </ButtonLink>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>

        <div className="mc-col-4 mc-stack mc-gap-20">
          <Card tone="dew">
            <CardHeader
              size="sm"
              icon={<ListChecks size={18} aria-hidden="true" />}
              title={m.firstSteps.title}
              subtitle={state ? m.firstSteps.progress(firstStepsDone(state), FIRST_STEPS.length) : undefined}
            />
            {state ? <FirstSteps state={state} running={(shell?.activeJobs ?? 0) > 0} layout="list" /> : <Skeleton height={280} radius="md" />}
          </Card>

          <Card>
            <CardHeader size="sm" icon={<Keyboard size={18} aria-hidden="true" />} title={m.shortcuts.title} />
            <div className="mc-stack mc-gap-12">
              <KeyValueList items={[{ id: 'F1', key: m.shortcuts.help, value: <Kbd>F1</Kbd> }]} />
              <div className="mc-label">{m.shortcuts.editor}</div>
              <KeyValueList items={editorShortcuts(t).map(([keys, action]) => ({ id: keys, key: action, value: <Kbd>{keys}</Kbd> }))} />
            </div>
          </Card>

          <Card>
            <CardHeader size="sm" icon={<LifeBuoy size={18} aria-hidden="true" />} title={m.support.title} />
            <div className="mc-stack mc-gap-12">
              <p className="mc-muted" style={{ margin: 0 }}>
                {m.support.text}
              </p>
              <div className="mc-row mc-row--wrap mc-gap-8">
                <ButtonLink href="/system/about/" variant="secondary" size="sm" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
                  {m.support.about}
                </ButtonLink>
                {isDesktop() && systemInfo?.logs_dir && (
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
