'use client'

import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, FileText, FileUp, FolderOpen, Image as ImageIcon, Plus, RefreshCw, ScanText, Trash2, Type } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Button, ButtonLink, Card, CardHeader, ConfirmModal, Divider, DropZone, IconButton, Spinner, TextAreaField } from '@/components/ui'
import { useEngine } from '@/contexts/EngineContext'
import { api, EngineError, type Campaign, type CampaignSource } from '@/lib/engine'
import { errorMessage, formatBytes, formatDateTime } from '@/lib/format'
import { localeTag, tm } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'
import { assetUrl, isDesktop, revealInExplorer } from '@/lib/media'
import { BRIEF_FILE_ACCEPT, BRIEF_FILE_EXTENSIONS, MAX_FILE_MB, MAX_SOURCES, fileExtension, screenshotStamp } from './helpers'

/** Engine limit for one typed text piece (services/campaigns.py TEXT_SOURCE_MAX). */
const TEXT_MAX = 60_000

const KIND_ICON = {
  text: <Type size={16} aria-hidden="true" />,
  file: <FileText size={16} aria-hidden="true" />,
  image: <ImageIcon size={16} aria-hidden="true" />,
}

function SourceRow({
  source,
  open,
  onToggle,
  onRemove,
  onReveal,
}: {
  source: CampaignSource
  open: boolean
  onToggle: () => void
  onRemove: () => void
  onReveal?: () => void
}) {
  const t = useT()
  const m = t.campaign.material
  const meta: string[] = [m.kind[source.kind]]
  if (source.kind !== 'text' && source.size) meta.push(formatBytes(source.size))
  if (source.pages) meta.push(m.pages(source.pages))
  if (source.images?.length) meta.push(m.scanned(source.images.length))
  if (source.text) meta.push(m.chars(source.text.length.toLocaleString(localeTag())))
  meta.push(formatDateTime(source.added_at))
  const note = source.kind === 'image' ? m.imageNote : source.kind === 'file' && !source.text && !source.images?.length ? m.noText : null
  const thumb = source.kind === 'image' && source.path ? assetUrl(`asset://${source.path}`) : ''
  const textId = `campaign-source-text-${source.id}`

  return (
    <li className="campaign-source">
      <div className="campaign-source__row">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="campaign-source__thumb" src={thumb} alt="" />
        ) : (
          <span className="campaign-source__icon" aria-hidden="true">
            {KIND_ICON[source.kind]}
          </span>
        )}
        <div className="mc-grow">
          <div className="mc-label mc-truncate" title={source.name}>
            {source.name}
          </div>
          <div className="mc-caption mc-muted">{meta.join(' · ')}</div>
          {note && <div className="mc-caption mc-subtle">{note}</div>}
        </div>
        <div className="mc-row mc-gap-4">
          {source.text && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={textId}
              onClick={onToggle}
              iconRight={<ChevronDown size={16} aria-hidden="true" className={open ? 'campaign-chevron--open' : undefined} />}
            >
              {open ? m.hideText : m.showText}
            </Button>
          )}
          {onReveal && <IconButton size="sm" variant="ghost" label={m.show(source.name)} icon={<FolderOpen size={16} />} onClick={onReveal} />}
          <IconButton size="sm" variant="ghost" label={m.remove(source.name)} icon={<Trash2 size={16} />} onClick={onRemove} />
        </div>
      </div>
      {source.text && open && (
        <pre id={textId} className="campaign-source__text">
          {source.text}
        </pre>
      )}
    </li>
  )
}

interface SourcesCardProps {
  campaign: Campaign
  /** The engine's campaign after a change made here */
  onCampaign: (campaign: Campaign) => void
}

/** Brief material (typed text, documents, screenshots) and "Understand the brief". */
export function SourcesCard({ campaign, onCampaign }: SourcesCardProps) {
  const t = useT()
  const m = t.campaign.material
  const r = t.campaign.read
  const { systemInfo } = useEngine()
  const desktop = isDesktop()

  const [text, setText] = useState('')
  const [addingText, setAddingText] = useState(false)
  const [upload, setUpload] = useState<{ i: number; n: number } | null>(null)
  const [dropError, setDropError] = useState<string | null>(null)
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({})
  const [removeTarget, setRemoveTarget] = useState<CampaignSource | null>(null)
  const [removing, setRemoving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<{ message: string; settings: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const sources = campaign.sources || []
  const full = sources.length >= MAX_SOURCES
  const parse = campaign.parse || { status: 'idle' }
  const running = parse.status === 'running'
  const briefRead = parse.status === 'done' || !!campaign.draft || campaign.version > 1 || !!campaign.brief?.summary

  const addText = async () => {
    const value = text.trim()
    if (!value || addingText) return
    setAddingText(true)
    try {
      const { campaign: next } = await api.campaigns.addText(campaign.id, value)
      onCampaign(next)
      setText('')
      toast.success(m.added(1))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setAddingText(false)
    }
  }

  const addFiles = async (files: File[]) => {
    if (upload) return
    const msg = tm().campaign.material
    setDropError(null)
    const room = MAX_SOURCES - sources.length
    if (room <= 0) {
      setDropError(msg.full(MAX_SOURCES))
      return
    }
    // The first problem is shown under the drop zone; the other files still go up
    const problems: string[] = []
    const valid = files.filter((f) => {
      if (!BRIEF_FILE_EXTENSIONS.includes(fileExtension(f.name))) {
        problems.push(`${f.name}: ${msg.badType}`)
        return false
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        problems.push(`${f.name}: ${msg.tooLarge(MAX_FILE_MB)}`)
        return false
      }
      return true
    })
    if (valid.length > room) problems.push(msg.full(MAX_SOURCES))
    if (problems.length) setDropError(problems[0])
    const queue = valid.slice(0, room)
    let added = 0
    let latest: Campaign | null = null
    for (let i = 0; i < queue.length; i++) {
      setUpload({ i: i + 1, n: queue.length })
      try {
        latest = (await api.campaigns.addFile(campaign.id, queue[i])).campaign
        added++
      } catch (err) {
        toast.error(`${msg.addFailed(queue[i].name)}: ${errorMessage(err)}`)
      }
    }
    setUpload(null)
    if (latest) onCampaign(latest)
    if (added) toast.success(msg.added(added))
  }

  // Ctrl+V anywhere on the page adds a screenshot from the clipboard (text pastes normally)
  const addFilesRef = useRef(addFiles)
  addFilesRef.current = addFiles
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const images = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
      if (!images.length) return
      e.preventDefault()
      const stamp = screenshotStamp()
      const named = images.map((f, i) => {
        const ext = f.type === 'image/jpeg' ? 'jpg' : f.type.split('/')[1] || 'png'
        const base = tm().campaign.material.screenshotName(stamp) + (images.length > 1 ? ` (${i + 1})` : '')
        return new File([f], `${base}.${ext}`, { type: f.type })
      })
      addFilesRef.current(named)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const removeSource = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      const { campaign: next } = await api.campaigns.removeSource(campaign.id, removeTarget.id)
      onCampaign(next)
      toast.success(m.removed)
      setRemoveTarget(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRemoving(false)
    }
  }

  const startParse = async () => {
    if (starting || running) return
    setStarting(true)
    setStartError(null)
    try {
      const { campaign: next } = await api.campaigns.parse(campaign.id)
      onCampaign(next)
    } catch (err) {
      // 400: no LLM configured (the message says what to set in Settings)
      setStartError({ message: errorMessage(err, r.startFailed), settings: err instanceof EngineError && err.status === 400 })
    } finally {
      setStarting(false)
    }
  }

  const reveal = (source: CampaignSource) =>
    desktop && source.path && systemInfo?.data_root ? () => revealInExplorer(systemInfo.data_root, source.path) : undefined

  return (
    <Card as="section">
      <CardHeader
        size="sm"
        icon={<FileText size={18} aria-hidden="true" />}
        title={m.title}
        subtitle={m.subtitle}
        action={<span className="mc-caption mc-muted">{m.count(sources.length, MAX_SOURCES)}</span>}
      />

      <div className="mc-stack mc-gap-20">
        {sources.length > 0 && (
          <ul className="campaign-sources">
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                open={!!openIds[s.id]}
                onToggle={() => setOpenIds((o) => ({ ...o, [s.id]: !o[s.id] }))}
                onRemove={() => setRemoveTarget(s)}
                onReveal={reveal(s)}
              />
            ))}
          </ul>
        )}

        <div className="campaign-material-add">
          <div className="mc-stack mc-gap-8">
            <TextAreaField
              label={m.textLabel}
              rows={5}
              value={text}
              maxLength={TEXT_MAX}
              placeholder={m.textPlaceholder}
              disabled={full}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mc-row mc-row--end">
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={16} aria-hidden="true" />}
                onClick={addText}
                loading={addingText}
                disabled={!text.trim() || full}
              >
                {m.addText}
              </Button>
            </div>
          </div>
          <div className="mc-stack mc-gap-8">
            <DropZone
              title={upload ? m.uploading(upload.i, upload.n) : m.dropTitle}
              overTitle={m.dropOver}
              hint={full ? m.full(MAX_SOURCES) : m.dropHint(MAX_FILE_MB)}
              icon={upload ? <Spinner size="sm" /> : <FileUp size={22} />}
              onActivate={() => fileInput.current?.click()}
              onFiles={addFiles}
              disabled={!!upload || full}
              invalid={!!dropError}
              className="campaign-drop"
            />
            {dropError && (
              <span className="mc-field__error" role="alert">
                <AlertTriangle size={14} aria-hidden="true" />
                {dropError}
              </span>
            )}
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept={BRIEF_FILE_ACCEPT}
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                e.target.value = ''
                if (files.length) addFiles(files)
              }}
            />
          </div>
        </div>

        <Divider />

        {running ? (
          <div className="mc-row mc-gap-12" role="status">
            <Spinner />
            <div>
              <div className="mc-label">{r.running}</div>
              <div className="mc-caption mc-muted">{r.runningHint}</div>
            </div>
          </div>
        ) : (
          <div className="mc-row mc-row--between mc-gap-16">
            <p className="mc-caption mc-muted mc-grow">{sources.length ? r.hint : m.empty}</p>
            <Button
              variant={briefRead ? 'secondary' : 'primary'}
              icon={briefRead ? <RefreshCw size={16} aria-hidden="true" /> : <ScanText size={16} aria-hidden="true" />}
              onClick={startParse}
              loading={starting}
              disabled={!sources.length}
            >
              {briefRead ? r.again : r.button}
            </Button>
          </div>
        )}

        {startError && !running && (
          <Alert
            tone="error"
            title={r.startFailed}
            action={
              startError.settings ? (
                <ButtonLink href="/settings/" variant="secondary" size="sm">
                  {r.openSettings}
                </ButtonLink>
              ) : undefined
            }
          >
            {startError.message}
          </Alert>
        )}
        {!startError && parse.status === 'failed' && (
          <Alert
            tone="error"
            title={r.failedTitle}
            action={
              <Button variant="secondary" size="sm" onClick={startParse} loading={starting} disabled={!sources.length}>
                {t.common.retry}
              </Button>
            }
          >
            {parse.message || r.failedToast}
          </Alert>
        )}
      </div>

      <ConfirmModal
        isOpen={!!removeTarget}
        title={m.removeTitle(removeTarget?.name || '')}
        message={m.removeBody}
        confirmLabel={m.removeConfirm}
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        danger
        loading={removing}
        onConfirm={removeSource}
        onClose={() => !removing && setRemoveTarget(null)}
      />
    </Card>
  )
}
