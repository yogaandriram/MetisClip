'use client'

import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { DEFAULT_LANG, DICTIONARIES, getLang, localeTag, markRendering, setLang, subscribeLang, type Lang, type Messages } from './index'

type I18nValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  /** Messages of the current language */
  t: Messages
  /** BCP 47 tag for Intl (id-ID / en-GB) */
  locale: string
}

const I18nContext = createContext<I18nValue | null>(null)

/**
 * Current UI language for the whole app (root layout). A language switch re-renders every component
 * that reads useT / useI18n, without a reload, so unsaved edits are kept.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  // The static export is prerendered in DEFAULT_LANG; React hydrates with the server snapshot and then
  // re-renders with the stored language, so there is no hydration mismatch.
  const lang = useSyncExternalStore(subscribeLang, getLang, () => DEFAULT_LANG)
  markRendering(lang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t: DICTIONARIES[lang], locale: localeTag(lang) }), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

const FALLBACK: I18nValue = { lang: DEFAULT_LANG, setLang, t: DICTIONARIES[DEFAULT_LANG], locale: localeTag(DEFAULT_LANG) }

export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? FALLBACK
}

/** The current language's messages: `const t = useT()` then `t.common.save`, `t.jobs.deleted(3)`. */
export function useT(): Messages {
  return useI18n().t
}
