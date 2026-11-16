'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type Campaign } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { tm } from '@/lib/i18n'
import { useEngine } from './EngineContext'

const STORAGE_KEY = 'activeCampaignId'

type CampaignContextType = {
  /** Every campaign, active and archived, most recently updated first */
  campaigns: Campaign[]
  /** The active (not archived) ones: what the switcher lists and jobs can follow */
  activeCampaigns: Campaign[]
  /** The campaign the app is scoped to (Beranda, Hasil Clip, Cari Video); null when there is none */
  activeCampaign: Campaign | null
  setActiveCampaign: (id: string | null) => void
  refreshCampaigns: () => Promise<Campaign[]>
  isCampaignLoading: boolean
  campaignError: string | null
}

const CampaignContext = createContext<CampaignContextType | undefined>(undefined)

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Remember the active campaign for this viewer (also used by the Setup Wizard, outside the provider). */
export function rememberActiveCampaign(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable: the choice is simply not remembered */
  }
}

/**
 * The campaign library and the active campaign. Campaigns hold everything in the app (jobs, clips,
 * brief, brand template); the active one scopes the pages. The choice is remembered per viewer; an
 * archived or deleted active campaign falls back to the most recently updated active one.
 */
export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const { epoch } = useEngine()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [isCampaignLoading, setIsCampaignLoading] = useState(true)
  const [campaignError, setCampaignError] = useState<string | null>(null)

  useEffect(() => {
    setChosenId(readStoredId())
  }, [])

  const refreshCampaigns = useCallback(async () => {
    try {
      const { campaigns: list } = await api.campaigns.list()
      setCampaigns(list)
      setCampaignError(null)
      return list
    } catch (err) {
      setCampaignError(errorMessage(err, tm().shell.campaignsLoadFailed))
      return []
    } finally {
      setIsCampaignLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshCampaigns()
  }, [refreshCampaigns, epoch])

  // Several events arrive together (a save and a parse): reload once, without a loading state
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEngineEvents((event) => {
    if (event.type !== 'campaign.updated' && event.type !== 'campaign.deleted') return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(refreshCampaigns, 300)
  })
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const activeCampaigns = useMemo(() => campaigns.filter((c) => c.status !== 'archived'), [campaigns])
  const activeCampaign = useMemo(() => {
    const chosen = chosenId ? activeCampaigns.find((c) => c.id === chosenId) : undefined
    if (chosen) return chosen
    return [...activeCampaigns].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0] || null
  }, [activeCampaigns, chosenId])

  const setActiveCampaign = useCallback((id: string | null) => {
    setChosenId(id)
    rememberActiveCampaign(id)
  }, [])

  return (
    <CampaignContext.Provider
      value={{ campaigns, activeCampaigns, activeCampaign, setActiveCampaign, refreshCampaigns, isCampaignLoading, campaignError }}
    >
      {children}
    </CampaignContext.Provider>
  )
}

export function useCampaign() {
  const context = useContext(CampaignContext)
  if (context === undefined) {
    throw new Error('useCampaign must be used within a CampaignProvider')
  }
  return context
}
