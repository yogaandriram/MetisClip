'use client'

import React from 'react'
import { AlertTriangle, Plus, Users } from 'lucide-react'
import { useAgent } from '@/contexts/AgentContext'
import { Button, ButtonLink, EmptyState, Skeleton } from '@/components/ui'

/** Shown by pages that need an active Super Agent. */
export function NoAgentState({ what = 'halaman ini' }: { what?: string }) {
  const { isAgentLoading, agents, agentError, refreshAgents } = useAgent()

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
        title="Gagal memuat Super Agent"
        description={agentError}
        action={
          <Button variant="secondary" onClick={() => refreshAgents()}>
            Coba lagi
          </Button>
        }
      />
    )
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Belum ada Super Agent"
        description={`Buat Super Agent pertama Anda untuk mulai menggunakan ${what}. Setiap agent punya niche, durasi klip, dan brand template sendiri.`}
        action={
          <ButtonLink href="/agents/" variant="accent" icon={<Plus size={16} />}>
            Buat Super Agent
          </ButtonLink>
        }
      />
    )
  }

  return (
    <EmptyState
      icon={Users}
      title="Pilih Super Agent"
      description={`Pilih Super Agent aktif lewat pemilih agent di kanan atas untuk membuka ${what}.`}
      action={
        <ButtonLink href="/agents/" variant="primary">
          Kelola Super Agent
        </ButtonLink>
      }
    />
  )
}

export default NoAgentState
