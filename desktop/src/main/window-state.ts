// Remember window size, position and maximized state (userData\window-state.json).
import fs from 'node:fs'
import { screen, type BrowserWindow, type Rectangle } from 'electron'

export const MIN_WIDTH = 1280
export const MIN_HEIGHT = 720

interface State {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

function visibleOnSomeDisplay(b: Rectangle): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea
    // at least 100×50 px of the title area must be on a display
    return b.x + 100 > a.x && b.x < a.x + a.width - 100 && b.y >= a.y - 10 && b.y < a.y + a.height - 50
  })
}

export function loadWindowState(file: string): State {
  const wa = screen.getPrimaryDisplay().workAreaSize
  const fallback: State = {
    width: Math.max(MIN_WIDTH, Math.min(1440, wa.width)),
    height: Math.max(MIN_HEIGHT, Math.min(900, wa.height)),
    maximized: wa.width < 1440 || wa.height < 900,
  }
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<State>
    if (typeof s.width !== 'number' || typeof s.height !== 'number') return fallback
    const state: State = {
      width: Math.max(MIN_WIDTH, Math.round(s.width)),
      height: Math.max(MIN_HEIGHT, Math.round(s.height)),
      maximized: !!s.maximized,
    }
    if (typeof s.x === 'number' && typeof s.y === 'number') {
      const b = { x: Math.round(s.x), y: Math.round(s.y), width: state.width, height: state.height }
      if (visibleOnSomeDisplay(b)) {
        state.x = b.x
        state.y = b.y
      }
    }
    return state
  } catch {
    return fallback
  }
}

export function trackWindowState(win: BrowserWindow, file: string): void {
  let timer: NodeJS.Timeout | null = null
  const save = () => {
    if (win.isDestroyed()) return
    const maximized = win.isMaximized()
    const b = win.getNormalBounds()
    const state: State = { x: b.x, y: b.y, width: b.width, height: b.height, maximized }
    try {
      fs.writeFileSync(file, JSON.stringify(state))
    } catch {
      // best effort
    }
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 400)
  }
  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', schedule)
  win.on('unmaximize', schedule)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    save()
  })
}
