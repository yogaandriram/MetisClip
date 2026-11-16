'use client'

import React, { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader, Skeleton, Tabs, ToggleSwitch } from '@/components/ui'
import { useShell } from '@/components/shell/ShellContext'
import { useT } from '@/lib/i18n/I18nProvider'
import { ClipGallery, NO_CAMPAIGN } from './components/ClipGallery'
import { JobQueue } from './components/JobQueue'

type View = 'clips' | 'queue'

export default function ClipsPage() {
  return (
    <Suspense fallback={<Skeleton height={400} radius="lg" />}>
      <ClipsAndQueue />
    </Suspense>
  )
}

/** Hasil Clip: the clip gallery and the job queue are two tabs of one menu (`?tab=queue`, lib/routes.ts). */
function ClipsAndQueue() {
  const t = useT()
  const m = t.clips
  const router = useRouter()
  const params = useSearchParams()
  const shell = useShell()
  const view: View = params.get('tab') === 'queue' ? 'queue' : 'clips'
  const campaign = params.get('campaign') || ''
  // A campaign's clips can sit in several workspaces: coming from a campaign shows all of them
  const [allAgents, setAllAgents] = useState(() => !!campaign && campaign !== NO_CAMPAIGN)
  const running = shell?.activeJobs ?? 0

  // Other parameters (the campaign filter) stay, so switching back keeps the gallery as it was
  const setView = (next: View) => {
    const query = new URLSearchParams(params.toString())
    if (next === 'queue') query.set('tab', 'queue')
    else query.delete('tab')
    const qs = query.toString()
    router.replace(qs ? `/clips/?${qs}` : '/clips/', { scroll: false })
  }

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={<ToggleSwitch checked={allAgents} onChange={setAllAgents} label={m.allWorkspaces} />}
      />

      <div className="mc-stack mc-gap-24">
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
        {view === 'queue' ? <JobQueue allAgents={allAgents} /> : <ClipGallery allAgents={allAgents} />}
      </div>
    </>
  )
}
