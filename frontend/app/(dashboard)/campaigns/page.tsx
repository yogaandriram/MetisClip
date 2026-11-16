'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, Megaphone, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Button, EmptyState, InputField, Modal, PageHeader, Skeleton, Tabs, Tag } from '@/components/ui'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { shownClient } from '@/lib/brief'
import { api, type Campaign } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { tm } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'
import { campaignHref, deadlineBadge, parseBadge } from './components/helpers'
import { DeadlineBadge, ParseBadge } from './components/CampaignBadges'

type View = 'active' | 'archived'

const CREATE_FORM_ID = 'campaign-create-form'
const MAX_PLATFORMS = 3

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const t = useT()
  const m = t.campaign.library
  const parse = parseBadge(campaign)
  const due = deadlineBadge(campaign.brief?.deadline)
  const platforms = campaign.brief?.platforms || []
  return (
    <Link href={campaignHref(campaign.id)} className="mc-card mc-card--interactive mc-col-4 campaign-card" aria-label={m.open(campaign.name)}>
      <div className="mc-stack mc-gap-4">
        <h2 className="mc-h3 mc-clamp-2" title={campaign.name}>
          {campaign.name}
        </h2>
        {shownClient(campaign) && <div className="mc-caption mc-muted mc-truncate">{shownClient(campaign)}</div>}
      </div>

      {(parse || due) && (
        <div className="mc-row mc-row--wrap mc-gap-8">
          {parse && <ParseBadge badge={parse} />}
          {due && <DeadlineBadge badge={due} />}
        </div>
      )}

      <p className={campaign.brief?.summary ? 'mc-muted mc-clamp-2' : 'mc-subtle'}>{campaign.brief?.summary || m.noSummary}</p>

      {platforms.length > 0 && (
        <div className="mc-row mc-row--wrap mc-gap-4">
          {platforms.slice(0, MAX_PLATFORMS).map((p) => (
            <Tag key={p}>{p}</Tag>
          ))}
          {platforms.length > MAX_PLATFORMS && <Tag>{m.morePlatforms(platforms.length - MAX_PLATFORMS)}</Tag>}
        </div>
      )}

      <div className="campaign-card__foot mc-caption mc-muted">
        <span>{m.clips(campaign.clip_count)}</span>
        <span aria-hidden="true">·</span>
        <span>{m.exported(campaign.exported_count)}</span>
        <span aria-hidden="true">·</span>
        <span>{m.sources(campaign.source_count ?? 0)}</span>
      </div>
    </Link>
  )
}

export default function CampaignsPage() {
  const t = useT()
  const m = t.campaign
  const router = useRouter()
  const { epoch } = useEngine()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<View>('active')

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const { campaigns } = await api.campaigns.list()
      setCampaigns(campaigns)
      setLoadError(null)
    } catch (err) {
      setLoadError(errorMessage(err, tm().campaign.library.loadFailed))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, epoch])

  // Several events arrive together (save + parse): reload once
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEngineEvents((event) => {
    if (event.type !== 'campaign.updated' && event.type !== 'campaign.deleted' && event.type !== 'campaign.parse') return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(load, 250)
  })
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const active = useMemo(() => campaigns.filter((c) => c.status !== 'archived'), [campaigns])
  const archived = useMemo(() => campaigns.filter((c) => c.status === 'archived'), [campaigns])
  const shown = view === 'archived' ? archived : active

  const openCreate = () => {
    setName('')
    setClient('')
    setCreateOpen(true)
  }

  const create = async () => {
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      const { campaign } = await api.campaigns.create({ name: name.trim(), client: client.trim() })
      setCreateOpen(false)
      router.push(campaignHref(campaign.id))
    } catch (err) {
      toast.error(errorMessage(err, m.createDialog.failed))
    } finally {
      setCreating(false)
    }
  }

  const createButton = (
    <Button variant="accent" onClick={openCreate} icon={<Plus size={16} aria-hidden="true" />}>
      {m.library.create}
    </Button>
  )

  return (
    <>
      <PageHeader title={m.title} subtitle={m.library.subtitle} actions={campaigns.length > 0 ? createButton : undefined} />

      {!loaded ? (
        <div className="mc-grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={220} radius="lg" className="mc-col-4" />
          ))}
        </div>
      ) : loadError && campaigns.length === 0 ? (
        <Alert
          tone="error"
          title={m.library.loadErrorTitle}
          action={
            <Button variant="secondary" size="sm" onClick={load}>
              {t.common.retry}
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} title={m.library.emptyTitle} description={m.library.emptyText} action={createButton} />
      ) : (
        <div className="mc-stack mc-gap-20">
          {archived.length > 0 && (
            <Tabs
              onCanvas
              ariaLabel={m.library.tabsLabel}
              activeTab={view}
              onChange={(id) => setView(id as View)}
              tabs={[
                { id: 'active', label: <TabLabel text={m.library.tabActive} n={active.length} /> },
                { id: 'archived', label: <TabLabel text={m.library.tabArchived} n={archived.length} /> },
              ]}
              className="campaign-tabs"
            />
          )}
          {shown.length === 0 ? (
            view === 'archived' ? (
              <EmptyState icon={Archive} title={m.library.emptyArchivedTitle} description={m.library.emptyArchivedText} />
            ) : (
              <EmptyState icon={Megaphone} title={m.library.emptyTitle} description={m.library.emptyText} action={createButton} />
            )
          ) : (
            <div className="mc-grid">
              {shown.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title={m.createDialog.title}
        busy={creating}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form={CREATE_FORM_ID} variant="primary" loading={creating} disabled={!name.trim()}>
              {m.createDialog.create}
            </Button>
          </>
        }
      >
        <form
          id={CREATE_FORM_ID}
          className="mc-stack"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <InputField
            label={m.createDialog.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={m.createDialog.namePlaceholder}
            hint={m.createDialog.hint}
            data-autofocus
          />
          <InputField
            label={m.createDialog.client}
            value={client}
            onChange={(e) => setClient(e.target.value)}
            maxLength={80}
            placeholder={m.createDialog.clientPlaceholder}
          />
        </form>
      </Modal>
    </>
  )
}

function TabLabel({ text, n }: { text: string; n: number }) {
  return (
    <>
      {text} <span className="mc-mono">{n}</span>
    </>
  )
}
