/** Join class names, skipping anything that is not a non-empty string: cx('mc-btn', active && 'is-active'). */
export function cx(...parts: unknown[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ')
}
