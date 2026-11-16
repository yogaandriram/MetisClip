'use client'

import React, { useEffect } from 'react'
import { EngineGate, useEngine } from '@/contexts/EngineContext'
import { CampaignProvider } from '@/contexts/CampaignContext'
import { api } from '@/lib/engine'
import { useI18n } from '@/lib/i18n/I18nProvider'

/**
 * Without Electron (next dev in a browser) nothing else tells the engine the UI language, so send it
 * on every (re)connect and change. In the desktop app the main process does this (desktop/src/main/i18n.ts).
 */
function EngineLanguageSync() {
  const { epoch } = useEngine()
  const { lang } = useI18n()
  useEffect(() => {
    if (window.metis) return
    api.settings.update({ app: { language: lang } }).catch(() => undefined)
  }, [epoch, lang])
  return null
}

/** Engine connection gate + the campaign library and active campaign for every page inside the app shell. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <EngineGate>
      <EngineLanguageSync />
      <CampaignProvider>{children}</CampaignProvider>
    </EngineGate>
  )
}
