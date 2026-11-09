'use client'

import React from 'react'
import Link from 'next/link'
import { Bot } from 'lucide-react'
import { useAgent } from '@/contexts/AgentContext'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'

/** Shown by pages that need an active Super Agent. */
export function NoAgentState({ what = 'halaman ini' }: { what?: string }) {
  const { isAgentLoading, agents, agentError, refreshAgents } = useAgent()

  if (isAgentLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Skeleton height={36} width={280} />
        <Skeleton height={180} />
      </div>
    )
  }

  if (agentError) {
    return (
      <EmptyState
        icon={Bot}
        title="Gagal memuat Super Agent"
        description={agentError}
        action={
          <Button variant="secondary" size="sm" onClick={() => refreshAgents()}>
            Coba lagi
          </Button>
        }
      />
    )
  }

  return (
    <EmptyState
      icon={Bot}
      title={agents.length === 0 ? 'Belum ada Super Agent' : 'Pilih Super Agent'}
      description={
        agents.length === 0
          ? `Buat Super Agent pertama Anda untuk mulai menggunakan ${what}. Setiap agent punya niche, durasi klip, dan brand template sendiri.`
          : `Pilih Super Agent aktif di menu samping untuk membuka ${what}.`
      }
      action={
        <Link href="/agents/" style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="sm">
            {agents.length === 0 ? 'Buat Super Agent' : 'Kelola Super Agent'}
          </Button>
        </Link>
      }
    />
  )
}

export default NoAgentState
