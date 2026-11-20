// The notification-area (tray) icon and closing to it (Pengaturan → Aplikasi, "Tetap berjalan di tray").
// The icon shows while the setting is on, and while the window was sent to the background once ("Jalankan
// di latar belakang" when closing with work running). Jobs and exports keep running while the window is hidden.
import fs from 'node:fs'
import { BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { createLogger } from './logger'
import { getPaths } from './paths'
import { readPrefs, writePrefs } from './preferences'
import { tr } from './i18n'

const log = createLogger('tray')

export interface TrayHooks {
  /** Shows, restores and focuses the main window */
  showWindow: () => void
  /** "Quit MetisClip" in the tray menu (asks first while work runs) */
  quit: () => void
}

export class AppTray {
  private tray: Tray | null = null
  private enabled: boolean
  /** The window is hidden in the tray right now */
  private hidden = false

  constructor(private hooks: TrayHooks) {
    this.enabled = readPrefs().close_to_tray === true
  }

  /** Called once the app is ready: the icon shows from the start while the setting is on. */
  init(): void {
    if (this.enabled) this.ensure()
  }

  get closeToTray(): boolean {
    return this.enabled
  }

  setCloseToTray(on: boolean): void {
    if (on === this.enabled) return
    this.enabled = on
    writePrefs({ close_to_tray: on })
    log.info(`tutup ke tray: ${on ? 'aktif' : 'nonaktif'}`)
    if (on) this.ensure()
    else if (!this.hidden) this.destroy()
  }

  /** Hides the window and keeps MetisClip running; the first time, a notice says where it went. */
  hideWindow(win: BrowserWindow): void {
    this.ensure()
    if (!this.tray) {
      // Without an icon there would be no way back to a hidden window
      win.minimize()
      return
    }
    this.hidden = true
    win.hide()
    log.info('jendela disembunyikan ke tray')
    if (readPrefs().tray_notice_shown !== true) {
      const m = tr().tray
      try {
        this.tray.displayBalloon({ title: m.noticeTitle, content: m.noticeBody, iconType: 'custom', icon: nativeImage.createFromPath(getPaths().iconFile) })
      } catch (e) {
        log.warn(`notifikasi tray gagal: ${(e as Error).message}`)
      }
      writePrefs({ tray_notice_shown: true })
    }
  }

  /** The window is visible again: a tray kept only for this hide goes away. */
  windowShown(): void {
    this.hidden = false
    if (!this.enabled) this.destroy()
  }

  /** Rebuilds the menu in the current UI language. */
  refresh(): void {
    if (!this.tray) return
    const m = tr().tray
    this.tray.setToolTip(m.tooltip)
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: m.open, click: () => this.hooks.showWindow() },
        { type: 'separator' },
        { label: m.quit, click: () => this.hooks.quit() },
      ]),
    )
  }

  destroy(): void {
    if (!this.tray) return
    this.tray.destroy()
    this.tray = null
    log.info('ikon tray dihapus')
  }

  private ensure(): void {
    if (this.tray) return
    const icon = getPaths().iconFile
    if (!fs.existsSync(icon)) {
      log.warn(`ikon tray tidak ditemukan: ${icon}`)
      return
    }
    this.tray = new Tray(icon)
    // Windows convention: a single click opens the app; the right-click menu has "Quit"
    this.tray.on('click', () => this.hooks.showWindow())
    this.refresh()
    log.info('ikon tray dibuat')
  }
}
