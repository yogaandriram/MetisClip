'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

type Agent = {
  id: string
  name: string
  niche: string | null
  default_duration: string
  default_keywords: string | null
}

type AgentContextType = {
  activeAgent: Agent | null
  setActiveAgent: (agent: Agent | null) => void
  agents: Agent[]
  setAgents: (agents: Agent[]) => void
  refreshAgents: () => void
}

const AgentContext = createContext<AgentContextType | undefined>(undefined)

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [activeAgent, setActiveAgentState] = useState<Agent | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])

  const supabase = createClientComponentClient()

  const fetchAgents = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('super_agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching agents:', error)
      return
    }

    if (data) {
      setAgents(data)
      const stored = localStorage.getItem('activeAgentId')
      if (stored && data.length > 0) {
        const found = data.find(a => a.id === stored)
        if (found) {
          setActiveAgentState(found)
        } else {
          setActiveAgentState(data[0])
        }
      } else if (data.length > 0) {
        setActiveAgentState(data[0])
      } else {
        setActiveAgentState(null)
      }
    }
  }

  useEffect(() => {
    fetchAgents()
  }, [])

  const refreshAgents = () => {
    fetchAgents()
  }

  const setActiveAgent = (agent: Agent | null) => {
    setActiveAgentState(agent)
    if (agent) {
      localStorage.setItem('activeAgentId', agent.id)
    } else {
      localStorage.removeItem('activeAgentId')
    }
  }

  return (
    <AgentContext.Provider value={{ activeAgent, setActiveAgent, agents, setAgents, refreshAgents }}>
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
