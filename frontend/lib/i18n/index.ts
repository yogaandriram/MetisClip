// UI language (Bahasa Indonesia / English). One typed dictionary per language in ./messages;
// `en` must have exactly the keys and function signatures of `id` (checked by tsc).
//
// The choice is stored by the Electron main process (%APPDATA%\MetisClip\preferences.json) so its own
// screens and the engine use it too; without Electron (next dev in a browser) it lives in localStorage.
// The engine gets it through PUT /api/settings (app.language), see LanguageSync in I18nProvider.tsx.
import { id } from './messages/id'
import { en } from './messages/en'
import type { Messages } from './messages/id'

export type { Messages }

export type Lang = 'id' | 'en'

export const DEFAULT_LANG: Lang = 'id'

/** Every language, each named in its own language (shown the same in both UIs). */
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'id', name: 'Bahasa Indonesia' },
  { id: 'en', name: 'English' },
]

export const DICTIONARIES: Record<Lang, Messages> = { id, en }

const STORAGE_KEY = 'metisclip.lang'

export function isLang(value: unknown): value is Lang {
  return value === 'id' || value === 'en'
}

function initialLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG
  const fromDesktop = window.metis?.language
  if (isLang(fromDesktop)) return fromDesktop
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLang(stored)) return stored
  } catch {
    /* storage blocked: default */
  }
  return DEFAULT_LANG
}

let chosen: Lang = initialLang()
/**
 * The language the tree is rendering right now. I18nProvider sets it during its render, so helpers
 * called while rendering (format.ts, status labels) match the provider even during hydration, when the
 * provider still renders the server snapshot (DEFAULT_LANG).
 */
let rendering: Lang = DEFAULT_LANG
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return chosen
}

export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Switches the UI language at once (no reload) and remembers it. */
export function setLang(lang: Lang): void {
  if (!isLang(lang) || lang === chosen) return
  chosen = lang
  if (typeof window !== 'undefined') {
    if (window.metis?.setLanguage) {
      window.metis.setLanguage(lang).catch(() => undefined)
    } else {
      try {
        window.localStorage.setItem(STORAGE_KEY, lang)
      } catch {
        /* not persisted; still applied for this session */
      }
    }
  }
  listeners.forEach((cb) => cb())
}

/** @internal I18nProvider only. */
export function markRendering(lang: Lang): void {
  rendering = lang
}

/** The language being rendered (for code outside components; components use useT / useI18n). */
export function activeLang(): Lang {
  return typeof window === 'undefined' ? DEFAULT_LANG : rendering
}

/** Messages of the language being rendered, for helpers outside React components. */
export function tm(): Messages {
  return DICTIONARIES[activeLang()]
}

/** BCP 47 tag for Intl / toLocaleString. English uses en-GB: day before month and a 24-hour clock, as in Indonesia. */
export function localeTag(lang: Lang = activeLang()): string {
  return lang === 'en' ? 'en-GB' : 'id-ID'
}
