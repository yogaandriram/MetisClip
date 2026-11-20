'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Trash2 } from 'lucide-react'
import { Button, ConfirmModal } from '@/components/ui'
import { useT } from '@/lib/i18n/I18nProvider'

type Entry = {
  dirty: boolean
  /** Saves the page; true when it worked (the pending action then runs) */
  save?: () => Promise<boolean>
  /** Switching the active campaign drops this page's edits too (it loads the other campaign's data) */
  campaignSwitch?: boolean
}

type GuardValue = {
  register: (entry: Entry | null) => void
  /** Runs `action` now, or after the user saved or chose to drop the page's unsaved changes */
  guard: (action: () => void) => void
  /** Like guard, for switching the active campaign: asks only on pages where that loses edits */
  guardCampaignSwitch: (action: () => void) => void
}

const GuardContext = createContext<GuardValue | null>(null)

/**
 * One place that keeps unsaved edits from being lost (CLAUDE.md §9.3): the open page registers whether
 * it has unsaved changes (useUnsavedGuard), and then
 * - a click on any link inside the app (nav rail, campaign menu, headers, cards) asks first;
 * - code that navigates (or switches the campaign) goes through `guard`;
 * - closing MetisClip asks in the main process (window.metis.setUnsavedChanges); in a plain browser
 *   (next dev) the page asks through beforeunload.
 */
export function UnsavedGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const t = useT()
  const m = t.shell.unsaved
  const entryRef = useRef<Entry | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [saving, setSaving] = useState(false)

  const register = useCallback((entry: Entry | null) => {
    entryRef.current = entry
    setDirty(!!entry?.dirty)
  }, [])

  const ask = useCallback((action: () => void) => setPending(() => action), [])

  const guard = useCallback(
    (action: () => void) => {
      if (entryRef.current?.dirty) ask(action)
      else action()
    },
    [ask]
  )

  const guardCampaignSwitch = useCallback(
    (action: () => void) => {
      if (entryRef.current?.dirty && entryRef.current.campaignSwitch) ask(action)
      else action()
    },
    [ask]
  )

  // Links anywhere in the app. Capture phase on the document runs before React's own handlers, so
  // next/link never starts the navigation while the question is open.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!entryRef.current?.dirty || e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target instanceof Element ? e.target.closest('a[href]') : null) as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      const href = link.getAttribute('href') || ''
      if (!href.startsWith('/') || href.startsWith('//')) return
      // A link to the page that is open (e.g. its own nav item) leaves nothing behind
      const target = new URL(href, window.location.href)
      const here = window.location
      const trim = (p: string) => p.replace(/\/+$/, '')
      if (trim(target.pathname) === trim(here.pathname) && target.search === here.search) return
      e.preventDefault()
      e.stopPropagation()
      ask(() => router.push(href))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [ask, router])

  useEffect(() => {
    if (window.metis) {
      window.metis.setUnsavedChanges(dirty)
      return
    }
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Leaving the app shell (e.g. the setup wizard) never leaves a stale "unsaved" flag in main
  useEffect(() => () => window.metis?.setUnsavedChanges(false), [])

  const proceed = () => {
    const action = pending
    setPending(null)
    action?.()
  }

  const saveAndProceed = async () => {
    const save = entryRef.current?.save
    if (!save) return proceed()
    setSaving(true)
    try {
      if (await save()) proceed()
    } finally {
      setSaving(false)
    }
  }

  const canSave = !!entryRef.current?.save
  // Stable: pages re-register only when their own state changes
  const value = useMemo(() => ({ register, guard, guardCampaignSwitch }), [register, guard, guardCampaignSwitch])

  return (
    <GuardContext.Provider value={value}>
      {children}
      <ConfirmModal
        isOpen={!!pending}
        title={m.title}
        message={m.body}
        confirmLabel={canSave ? m.saveAndLeave : m.leaveWithoutSaving}
        confirmIcon={canSave ? <Save size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
        danger={!canSave}
        loading={saving}
        onConfirm={canSave ? saveAndProceed : proceed}
        onClose={() => setPending(null)}
      >
        {canSave && (
          <div>
            <Button variant="danger" size="sm" icon={<Trash2 size={16} aria-hidden="true" />} onClick={proceed} disabled={saving}>
              {m.leaveWithoutSaving}
            </Button>
          </div>
        )}
      </ConfirmModal>
    </GuardContext.Provider>
  )
}

/**
 * Registers the page's unsaved state with the shell's guard and returns `guard(action)` for navigation the
 * page starts itself. `save` resolves true when the save worked.
 */
export function useUnsavedGuard(
  dirty: boolean,
  save?: () => Promise<boolean>,
  opts: { campaignSwitch?: boolean } = {}
): (action: () => void) => void {
  const ctx = useContext(GuardContext)
  const saveRef = useRef(save)
  saveRef.current = save
  const hasSave = !!save
  const campaignSwitch = !!opts.campaignSwitch

  useEffect(() => {
    ctx?.register({ dirty, save: hasSave ? () => saveRef.current?.() ?? Promise.resolve(false) : undefined, campaignSwitch })
  }, [ctx, dirty, hasSave, campaignSwitch])

  useEffect(() => () => ctx?.register(null), [ctx])

  return ctx?.guard ?? ((action: () => void) => action())
}

/** For the campaign switcher: asks first on pages where switching the campaign drops unsaved edits. */
export function useCampaignSwitchGuard(): (action: () => void) => void {
  return useContext(GuardContext)?.guardCampaignSwitch ?? ((action: () => void) => action())
}
