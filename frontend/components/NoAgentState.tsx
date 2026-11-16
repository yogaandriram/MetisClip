'use client'

import React from 'react'
import { AlertTriangle, Plus, Users } from 'lucide-react'
import { useAgent } from '@/contexts/AgentContext'
import { Button, ButtonLink, EmptyState, Skeleton } from '@/components/ui'
import { useT } from '@/lib/i18n/I18nProvider'

/** Shown by pages that need an active workspace. `what` names the page in the current language. */
export function NoAgentState({ what }: { what?: string }) {
  const { isAgentLoading, agents, agentError, refreshAgents } = useAgent()
  const t = useT()
  const m = t.workspace.noAgent
  const page = what ?? m.thisPage

  if (isAgentLoading) {
    return (
      <div className="mc-stack">
        <Skeleton height={36} width={280} radius="full" />
        <Skeleton height={180} radius="lg" />
      </div>
    )
  }

  if (agentError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={m.loadFailed}
        description={agentError}
        action={
          <Button variant="secondary" onClick={() => refreshAgents()}>
            {t.common.retry}
          </Button>
        }
      />
    )
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={m.emptyTitle}
        description={m.emptyDescription(page)}
        action={
          <ButtonLink href="/agents/" variant="accent" icon={<Plus size={16} />}>
            {m.create}
          </ButtonLink>
        }
      />
    )
  }

  return (
    <EmptyState
      icon={Users}
      title={m.chooseTitle}
      description={m.chooseDescription(page)}
      action={
        <ButtonLink href="/agents/" variant="primary">
          {m.manage}
        </ButtonLink>
      }
    />
  )
}

export default NoAgentState
