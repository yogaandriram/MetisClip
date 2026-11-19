// %APPDATA%\MetisClip\preferences.json: choices the main process needs before mongod and the engine run,
// or that only the shell acts on (the UI language, closing to the tray, app updates). Written atomically.
import fs from 'node:fs'
import path from 'node:path'
import { getPaths } from './paths'

export interface Preferences {
  /** UI language, 'id' or 'en' (i18n.ts) */
  language?: unknown
  /** Closing the window keeps MetisClip running in the notification area (tray.ts) */
  close_to_tray?: unknown
  /** The one-time "MetisClip is still running" notice was shown */
  tray_notice_shown?: unknown
  /** Check for and download new MetisClip versions (updater.ts); on unless false */
  auto_update?: unknown
  /** Last update check that reached the feed (ISO time) */
  update_checked_at?: unknown
}

function prefsFile(): string {
  return path.join(getPaths().appDataDir, 'preferences.json')
}

export function readPrefs(): Preferences {
  try {
    const data = JSON.parse(fs.readFileSync(prefsFile(), 'utf8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/** Merges `patch` into the saved preferences (other keys are kept). */
export function writePrefs(patch: Preferences): void {
  const file = prefsFile()
  const prefs = { ...readPrefs(), ...patch }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(prefs, null, 2))
  fs.renameSync(tmp, file)
}
