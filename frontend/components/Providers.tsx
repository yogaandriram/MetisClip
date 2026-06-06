'use client'

import React from 'react'
import { AgentProvider } from '@/contexts/AgentContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AgentProvider>
      {children}
    </AgentProvider>
  )
}
