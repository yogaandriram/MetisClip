'use client'

import React from 'react'
import { AlertTriangle, Megaphone, Plus } from 'lucide-react'
import { useCampaign } from '@/contexts/CampaignContext'
import { Button, ButtonLink, EmptyState, Skeleton } from '@/components/ui'
import { useT } from '@/lib/i18n/I18nProvider'

/** Shown by pages that need an active campaign. `what` names the page in the current language. */
export function NoCampaignState({ what }: { what?: string }) {
  const { isCampaignLoading, activeCampaigns, campaigns, campaignError, refreshCampaigns } = useCampaign()
  const t = useT()
  const m = t.campaign.noCampaign
  const page = what ?? m.thisPage

  if (isCampaignLoading) {
    return (
      <div className="mc-stack">
        <Skeleton height={36} width={280} radius="full" />
        <Skeleton height={180} radius="lg" />
      </div>
    )
  }

  if (campaignError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={m.loadFailed}
        description={campaignError}
        action={
          <Button variant="secondary" onClick={() => refreshCampaigns()}>
            {t.common.retry}
          </Button>
        }
      />
    )
  }

  // Only archived campaigns left: one has to be made active again (or a new one created)
  const onlyArchived = activeCampaigns.length === 0 && campaigns.length > 0
  return (
    <EmptyState
      icon={Megaphone}
      title={onlyArchived ? m.allArchivedTitle : m.emptyTitle}
      description={onlyArchived ? m.allArchivedDescription(page) : m.emptyDescription(page)}
      action={
        <ButtonLink href="/campaigns/" variant="accent" icon={onlyArchived ? undefined : <Plus size={16} aria-hidden="true" />}>
          {onlyArchived ? m.manage : m.create}
        </ButtonLink>
      }
    />
  )
}

export default NoCampaignState
