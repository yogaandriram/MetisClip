'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Alert, Button, PageHeader, Skeleton, Tabs, ToggleSwitch } from '@/components/ui'
import { NoCampaignState } from '@/components/NoCampaignState'
import { useShell } from '@/components/shell/ShellContext'
import { useCampaign } from '@/contexts/CampaignContext'
import { useT } from '@/lib/i18n/I18nProvider'
import { ClipGallery } from './components/ClipGallery'
import { JobQueue } from './components/JobQueue'

type View = 'clips' | 'queue'

export default function ClipsPage() {
  return (
    <Suspense fallback={<Skeleton height={400} radius="lg" />}>
      <ClipsAndQueue />
    </Suspense>
  )
}

/**
 * Hasil Clip: the clip gallery and the job queue are two tabs of one menu (`?tab=queue`, lib/routes.ts),
 * both scoped to the active campaign unless "Semua campaign" is on. `?campaign=<id>` (lib/brief.ts
 * campaignClipsHref) makes an active campaign the active one, or shows an archived campaign's clips.
 */
function ClipsAndQueue() {
  const t = useT()
  const m = t.clips
  const router = useRouter()
  const params = useSearchParams()
  const shell = useShell()
  const { campaigns, activeCampaign, setActiveCampaign, isCampaignLoading } = useCampaign()
  const view: View = params.get('tab') === 'queue' ? 'queue' : 'clips'
  const linked = params.get('campaign') || ''
  const [allCampaigns, setAllCampaigns] = useState(false)
  const running = shell?.activeJobs ?? 0

  const replaceQuery = (edit: (query: URLSearchParams) => void) => {
    const query = new URLSearchParams(params.toString())
    edit(query)
    const qs = query.toString()
    router.replace(qs ? `/clips/?${qs}` : '/clips/', { scroll: false })
  }

  // A link to an active campaign switches to it; the parameter is then dropped
  const linkedCampaign = linked ? campaigns.find((c) => c.id === linked) || null : null
  useEffect(() => {
    if (!linkedCampaign || linkedCampaign.status === 'archived') return
    setActiveCampaign(linkedCampaign.id)
    replaceQuery((q) => q.delete('campaign'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCampaign?.id, linkedCampaign?.status])
  const archived = linkedCampaign?.status === 'archived' ? linkedCampaign : null

  const setView = (next: View) =>
    replaceQuery((q) => {
      if (next === 'queue') q.set('tab', 'queue')
      else q.delete('tab')
    })

  const scope = allCampaigns ? undefined : archived?.id || activeCampaign?.id

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={<ToggleSwitch checked={allCampaigns} onChange={setAllCampaigns} label={m.allCampaigns} />}
      />

      {!allCampaigns && !archived && !activeCampaign ? (
        <NoCampaignState what={m.galleryName} />
      ) : isCampaignLoading && linked && !linkedCampaign ? (
        <Skeleton height={400} radius="lg" />
      ) : (
        <div className="mc-stack mc-gap-24">
          {archived && !allCampaigns && (
            <Alert
              tone="info"
              action={
                <Button variant="secondary" size="sm" onClick={() => replaceQuery((q) => q.delete('campaign'))}>
                  {m.backToActive}
                </Button>
              }
            >
              {m.viewingArchived(archived.name)}
            </Alert>
          )}
          <div>
            <Tabs
              onCanvas
              ariaLabel={m.tabs.label}
              activeTab={view}
              onChange={(id) => setView(id as View)}
              tabs={[
                { id: 'clips', label: m.tabs.clips },
                {
                  id: 'queue',
                  label:
                    running > 0 ? (
                      <>
                        {m.tabs.queue} <span className="mc-mono">{running}</span>
                      </>
                    ) : (
                      m.tabs.queue
                    ),
                },
              ]}
            />
          </div>
          {view === 'queue' ? <JobQueue campaignId={scope} /> : <ClipGallery campaignId={scope} />}
        </div>
      )}
    </>
  )
}
