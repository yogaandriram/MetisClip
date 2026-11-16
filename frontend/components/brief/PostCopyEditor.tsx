'use client'

import React, { useEffect, useState } from 'react'
import { Copy, PenLine, RotateCcw, Save, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button, ConfirmModal, InputField, TextAreaField } from '@/components/ui'
import { api, type Clip, type PostCopy } from '@/lib/engine'
import { POST_CAPTION_MAX, POST_DISCLOSURE_MAX, POST_TITLE_MAX, joinTags, parseTags, postCopyText } from '@/lib/postCopy'
import { errorMessage } from '@/lib/format'
import { useT } from '@/lib/i18n/I18nProvider'

type Draft = { title: string; caption: string; hashtags: string; mentions: string; disclosure: string }

const toDraft = (copy: PostCopy | null | undefined): Draft => ({
  title: copy?.title || '',
  caption: copy?.caption || '',
  hashtags: joinTags(copy?.hashtags),
  mentions: joinTags(copy?.mentions),
  disclosure: copy?.disclosure || '',
})

const fromDraft = (d: Draft) => ({
  title: d.title.replace(/\s+/g, ' ').trim(),
  caption: d.caption.trim(),
  hashtags: parseTags(d.hashtags, '#'),
  mentions: parseTags(d.mentions, '@'),
  disclosure: d.disclosure.trim(),
})

/** Compares what would be saved, so typing a trailing space does not count as a change. */
const sameCopy = (a: Draft, b: Draft) => JSON.stringify(fromDraft(a)) === JSON.stringify(fromDraft(b))

interface PostCopyEditorProps {
  clip: Clip
  /** Called after the engine saved or rewrote the text (the parent reloads the checklist) */
  onSaved: () => void
}

/** A campaign clip's post text: edit, save, rewrite with the AI, copy. MetisClip never posts it. */
export function PostCopyEditor({ clip, onSaved }: PostCopyEditorProps) {
  const t = useT()
  const p = t.brief.post
  const saved = toDraft(clip.post_copy)
  const [draft, setDraft] = useState<Draft>(saved)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)

  // The engine's text changed (saved here, rewritten, or another window): start from it again
  const savedKey = JSON.stringify(clip.post_copy || null)
  useEffect(() => {
    setDraft(toDraft(clip.post_copy))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  const dirty = !sameCopy(draft, saved)
  const hasCopy = !!clip.post_copy

  const save = async () => {
    setSaving(true)
    try {
      await api.clips.savePostCopy(clip.id, fromDraft(draft))
      toast.success(p.saved)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err, p.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  const generate = async () => {
    setConfirmReplace(false)
    setGenerating(true)
    try {
      await api.clips.generatePostCopy(clip.id)
      toast.success(p.generated)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err, p.generateFailed))
    } finally {
      setGenerating(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(postCopyText(fromDraft(draft)))
      toast.success(p.copied)
    } catch {
      toast.error(p.copyFailed)
    }
  }

  /** Ctrl+S here saves the post text, not the subtitles (the editor listens on window). */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      e.stopPropagation()
      if (dirty && !saving) save()
    }
  }

  if (!hasCopy && !editing) {
    return (
      <div className="mc-brief-post__empty">
        <div className="mc-stack mc-gap-4">
          <span className="mc-label">{p.emptyTitle}</span>
          <span className="mc-caption mc-muted">{p.emptyBody}</span>
        </div>
        <div className="mc-row mc-row--wrap mc-gap-8">
          <Button variant="primary" size="sm" icon={<Sparkles size={16} aria-hidden="true" />} loading={generating} onClick={generate}>
            {p.generate}
          </Button>
          <Button variant="secondary" size="sm" icon={<PenLine size={16} aria-hidden="true" />} onClick={() => setEditing(true)}>
            {p.writeManual}
          </Button>
        </div>
      </div>
    )
  }

  const source = clip.post_copy?.source
  return (
    <div className="mc-stack mc-gap-12" onKeyDown={onKeyDown}>
      <div className="mc-row mc-row--wrap mc-gap-8">
        {dirty ? (
          <Badge tone="neutral" size="sm" icon={<PenLine size={14} aria-hidden="true" />}>
            {p.unsaved}
          </Badge>
        ) : (
          source && (
            <Badge tone={source === 'ai' ? 'accent' : 'quiet'} size="sm" icon={source === 'ai' ? <Sparkles size={14} aria-hidden="true" /> : undefined}>
              {p.source[source]}
            </Badge>
          )
        )}
      </div>
      <InputField
        label={p.titleLabel}
        value={draft.title}
        maxLength={POST_TITLE_MAX}
        hint={p.count(draft.title.length, POST_TITLE_MAX)}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />
      <TextAreaField
        label={p.captionLabel}
        value={draft.caption}
        rows={5}
        maxLength={POST_CAPTION_MAX}
        hint={p.count(draft.caption.length, POST_CAPTION_MAX)}
        onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
      />
      <InputField
        label={p.hashtagsLabel}
        value={draft.hashtags}
        hint={p.tagsHint}
        placeholder="#…"
        onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })}
      />
      <InputField
        label={p.mentionsLabel}
        value={draft.mentions}
        hint={p.tagsHint}
        placeholder="@…"
        onChange={(e) => setDraft({ ...draft, mentions: e.target.value })}
      />
      <InputField
        label={p.disclosureLabel}
        value={draft.disclosure}
        maxLength={POST_DISCLOSURE_MAX}
        placeholder={p.disclosurePlaceholder}
        onChange={(e) => setDraft({ ...draft, disclosure: e.target.value })}
      />

      <div className="mc-row mc-row--wrap mc-gap-8">
        <Button variant="primary" size="sm" icon={<Save size={16} aria-hidden="true" />} loading={saving} disabled={!dirty || saving} onClick={save}>
          {p.save}
        </Button>
        <Button variant="secondary" size="sm" icon={<Copy size={16} aria-hidden="true" />} onClick={copy}>
          {p.copy}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Sparkles size={16} aria-hidden="true" />}
          loading={generating}
          disabled={generating}
          onClick={() => (dirty ? setConfirmReplace(true) : generate())}
        >
          {hasCopy ? p.regenerate : p.generate}
        </Button>
        {dirty && (
          <Button variant="ghost" size="sm" icon={<RotateCcw size={16} aria-hidden="true" />} onClick={() => setDraft(saved)}>
            {p.discard}
          </Button>
        )}
      </div>
      <p className="mc-caption mc-muted">{p.exportNote}</p>

      <ConfirmModal
        isOpen={confirmReplace}
        title={p.replaceModal.title}
        message={p.replaceModal.message}
        confirmLabel={p.replaceModal.confirm}
        loading={generating}
        onConfirm={generate}
        onClose={() => setConfirmReplace(false)}
      />
    </div>
  )
}

export default PostCopyEditor
