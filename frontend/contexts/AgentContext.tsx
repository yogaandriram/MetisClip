'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, type Agent } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { useEngine } from './EngineContext'

const STORAGE_KEY = 'activeAgentId'

type AgentContextType = {
  activeAgent: Agent | null
  setActiveAgent: (agent: Agent | null) => void
  agents: Agent[]
  setAgents: (agents: Agent[]) => void
  refreshAgents: () => Promise<Agent[]>
  isAgentLoading: boolean
  agentError: string | null
}

const AgentContext = createContext<AgentContextType | undefined>(undefined)

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable: selection is simply not remembered */
  }
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { epoch } = useEngine()
  const [activeAgent, setActiveAgentState] = useState<Agent | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [isAgentLoading, setIsAgentLoading] = useState(true)
  const [agentError, setAgentError] = useState<string | null>(null)

  const refreshAgents = useCallback(async () => {
    setIsAgentLoading(true)
    try {
      const { agents: list } = await api.agents.list()
      setAgents(list)
      setAgentError(null)
      setActiveAgentState((current) => {
        const wanted = current?.id || readStoredId()
        const found = (wanted && list.find((a) => a.id === wanted)) || list[0] || null
        writeStoredId(found?.id || null)
        return found
      })
      return list
    } catch (err) {
      setAgentError(errorMessage(err, 'Gagal memuat daftar workspace'))
      return []
    } finally {
      setIsAgentLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshAgents()
  }, [refreshAgents, epoch])

  const setActiveAgent = useCallback((agent: Agent | null) => {
    setActiveAgentState(agent)
    writeStoredId(agent?.id || null)
  }, [])

  return (
    <AgentContext.Provider value={{ activeAgent, setActiveAgent, agents, setAgents, refreshAgents, isAgentLoading, agentError }}>
      {children}
    </AgentContext.Provider>
  )
}

export function useAgent() {
  const context = useContext(AgentContext)
  if (context === undefined) {
    throw new Error('useAgent must be used within an AgentProvider')
  }
  return context
}
