// A campaign clip's post text (engine: backend/agents/tools/post_copy_ai.py). The engine writes the same
// block into the export .txt, so the copy button and the file stay identical.
import type { PostCopy } from '@/lib/engine'

/** Limits of PUT /api/clips/{id}/post-copy (post_copy_ai.TITLE_MAX, CAPTION_MAX, TAGS_MAX). */
export const POST_TITLE_MAX = 120
export const POST_CAPTION_MAX = 2200
export const POST_TAGS_MAX = 30
export const POST_DISCLOSURE_MAX = 300

/** Mirrors post_copy_ai.as_text: title, caption, mentions + hashtags, disclosure, separated by blank lines. */
export function postCopyText(copy: Pick<PostCopy, 'title' | 'caption' | 'hashtags' | 'mentions' | 'disclosure'> | null | undefined): string {
  if (!copy) return ''
  const tags = [...(copy.mentions || []), ...(copy.hashtags || [])].join(' ')
  const parts = [copy.title || '', copy.caption || '', tags, copy.disclosure || ''].map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts.join('\n\n') + '\n' : ''
}

/** Mirrors documents._tag: '#Brand X' -> '#BrandX', 'brand' -> '@brand' (no spaces in a tag). */
function tag(value: string, prefix: '#' | '@'): string {
  const core = value.replace(/\s+/g, '').replace(/^[#@]+/, '')
  return core ? prefix + core : ''
}

/** "#a #b, c" -> ['#a', '#b', '#c']: split on spaces and commas, prefixed, without duplicates (any case). */
export function parseTags(text: string, prefix: '#' | '@'): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const piece of text.split(/[\s,]+/)) {
    const t = tag(piece, prefix)
    if (t.length > 1 && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      out.push(t)
    }
  }
  return out.slice(0, POST_TAGS_MAX)
}

export const joinTags = (tags: string[] | undefined) => (tags || []).join(' ')
