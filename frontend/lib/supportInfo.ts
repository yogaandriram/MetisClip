// "Salin info sistem" (§10.5): a plain-text summary a user pastes when asking for help. API keys are never
// part of it (the engine does not hand them out), and the Windows account name in paths is replaced.
import type { Settings, StorageInfo, SystemCheck, SystemInfo } from '@/lib/engine'
import { formatBytes, formatDateTime } from '@/lib/format'
import { localeTag, type Lang, type Messages } from '@/lib/i18n'
import { LLM_PROVIDERS } from '@/lib/llmProviders'

export interface SupportInput {
  t: Messages
  lang: Lang
  systemInfo: SystemInfo | null
  check: SystemCheck | null
  storage: StorageInfo | null
  settings: Settings | null
  now?: Date
}

/**
 * Copies text that is still being put together. The clipboard is asked for at once, inside the click, with
 * the text as a promise: Chromium only lets a page write the clipboard shortly after the user's click, and
 * the component check can take several seconds.
 */
export async function copyWhenReady(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = text.then((s) => new Blob([s], { type: 'text/plain' }))
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
  } else {
    await navigator.clipboard.writeText(await text)
  }
}

/** "C:\Users\Jane Doe\MetisClip" -> "%USERPROFILE%\MetisClip": the account name often is a person's name */
export function hideProfileName(text: string): string {
  return text.replace(/[A-Za-z]:\\Users\\[^\\\r\n]+/gi, '%USERPROFILE%')
}

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

export function supportText({ t, lang, systemInfo, check, storage, settings, now = new Date() }: SupportInput): string {
  const m = t.about
  const i = m.info
  const metis = typeof window !== 'undefined' ? window.metis : undefined
  const lines: string[] = []

  const appVersion = metis?.appVersion || systemInfo?.version || '?'
  const build = metis ? (metis.isPackaged ? m.buildInstalled : m.buildDev) : systemInfo?.env === 'dev' ? m.buildDev : ''
  lines.push(`MetisClip ${appVersion}${build ? ` (${build})` : ''}`)
  if (systemInfo) {
    const mongo = systemInfo.mongo.ok ? `MongoDB ${systemInfo.mongo.version || ''}`.trim() : `MongoDB: ${i.failed}`
    lines.push(`${i.engine}: ${systemInfo.version}${systemInfo.env === 'dev' ? ' (dev)' : ''} · ${mongo}`)
  }
  if (metis?.versions) {
    const v = metis.versions
    lines.push(`Electron ${v.electron} · Chrome ${v.chrome} · Node ${v.node}`)
  }
  if (metis?.osVersion) lines.push(`${i.windows}: ${metis.osVersion}${metis.arch ? ` (${metis.arch})` : ''}`)

  if (check) {
    lines.push(`${i.cpu}: ${i.cores(check.cpu_count)} · ${i.ram}: ${check.ram_gb.toLocaleString(localeTag(lang))} GB`)
    lines.push(`${i.encoders}: ${check.encoders.join(', ') || '-'}`)
    lines.push(`${i.components}:`)
    for (const item of check.items) {
      if (item.key === 'disk' || item.key === 'library') continue // the data folder line says it
      const state = item.ok ? item.version || 'ok' : `${i.failed}${item.detail ? ` (${hideProfileName(item.detail)})` : ''}`
      lines.push(`  - ${item.label}: ${state}`)
    }
  }

  if (storage) {
    const notes = [i.free(formatBytes(storage.drive_free_bytes), formatBytes(storage.drive_total_bytes))]
    if (storage.access === 'private') notes.push(i.accessPrivate)
    if (storage.access === 'shared') notes.push(i.accessShared)
    if (/[^\x00-\x7F]/.test(storage.data_root)) notes.push(i.nonAscii)
    lines.push(`${i.dataFolder}: ${hideProfileName(storage.data_root)} (${notes.join(', ')})`)
  }

  if (settings) {
    const provider = settings.llm.provider
    if (provider) {
      const label = LLM_PROVIDERS.find((p) => p.id === provider)?.label || provider
      const where = provider === 'openai_compatible' ? host(settings.llm.base_url) : ''
      lines.push(`${i.llm}: ${label}${where ? ` (${where})` : ''} · ${settings.llm.models[provider] || '-'}`)
    } else {
      lines.push(`${i.llm}: ${i.noProvider}`)
    }
    lines.push(`${i.transcription}: ${settings.whisper.provider} · ${i.localModel(settings.whisper.local_model)}`)
  }
  lines.push(`${i.language}: ${lang}`)
  lines.push(`${i.made}: ${formatDateTime(now.toISOString())}`)
  return lines.join('\n')
}
