import type { Messages } from '@/lib/i18n'

/** The clip editor's keyboard shortcuts (CLAUDE.md §9.3), for its shortcut dialog and the help page: [keys, action]. */
export function editorShortcuts(t: Messages): [string, string][] {
  const m = t.editor.shortcuts
  return [
    [m.spaceKey, m.playPause],
    ['← / →', m.step],
    ['Shift + ← / →', m.stepLong],
    ['Ctrl + S', m.save],
    ['Ctrl + Z', m.undo],
    ['Ctrl + Y', m.redo],
    ['Ctrl + E', m.export],
    ['Ctrl + F', m.find],
  ]
}
