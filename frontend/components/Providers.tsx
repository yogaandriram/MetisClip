'use client'

import React from 'react'
import { EngineGate } from '@/contexts/EngineContext'
import { AgentProvider } from '@/contexts/AgentContext'

/** Engine connection gate + workspace state for every page inside the app shell. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <EngineGate>
      <AgentProvider>{children}</AgentProvider>
    </EngineGate>
  )
}
