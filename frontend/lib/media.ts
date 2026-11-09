// Non-throwing wrappers around the engine URL helpers. The helpers throw while the
// engine connection is being re-resolved (e.g. right after an engine restart);
// rendering must never crash because of that.
import { clipMediaUrl, resolveAsset, toAbsolutePath } from './engine'

export function mediaUrl(clipId: string, kind: 'raw' | 'final' | 'thumbnail', version?: string | number): string {
  try {
    return clipMediaUrl(clipId, kind, version)
  } catch {
    return ''
  }
}

export function assetUrl(value: string | null | undefined): string {
  try {
    return resolveAsset(value)
  } catch {
    return ''
  }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.metis
}

/** Reveals a data-root-relative file in Explorer. Returns false when not possible. */
export async function revealInExplorer(dataRoot: string | null | undefined, relativePath: string | null | undefined): Promise<boolean> {
  if (!isDesktop() || !dataRoot || !relativePath) return false
  await window.metis!.showItemInFolder(toAbsolutePath(dataRoot, relativePath))
  return true
}
