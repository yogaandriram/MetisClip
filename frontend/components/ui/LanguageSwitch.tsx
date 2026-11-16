'use client'

import React from 'react'
import { Languages } from 'lucide-react'
import toast from 'react-hot-toast'
import { DICTIONARIES, LANGS, type Lang } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { ChoiceChips } from './Chip'
import { Field } from './Field'

interface LanguageSwitchProps {
  /** Show the "Bahasa tampilan" label and hint above the chips */
  withLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * UI language choice. Each language is named in its own language, so it can be found from either UI.
 * The switch applies at once, without a reload.
 */
export function LanguageSwitch({ withLabel = false, size = 'md', className }: LanguageSwitchProps) {
  const { lang, setLang, t } = useI18n()
  const change = (next: Lang) => {
    if (next === lang) return
    setLang(next)
    toast.success(DICTIONARIES[next].shell.language.changed, { id: 'ui-language' })
  }
  const chips = (
    <ChoiceChips<Lang>
      ariaLabel={t.shell.language.label}
      value={lang}
      onChange={change}
      size={size}
      options={LANGS.map((l) => ({ value: l.id, label: <span lang={l.id}>{l.name}</span> }))}
    />
  )
  if (!withLabel) return <div className={className}>{chips}</div>
  return (
    <Field
      className={className}
      label={
        <span className="mc-row mc-gap-8">
          <Languages size={16} aria-hidden="true" />
          {t.shell.language.label}
        </span>
      }
      hint={t.shell.language.hint}
    >
      {chips}
    </Field>
  )
}

export default LanguageSwitch
