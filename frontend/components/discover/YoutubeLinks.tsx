'use client'

import React from 'react'
import { Link2, ListVideo, Plus, Trash2, X } from 'lucide-react'
import { Alert, Button, Card, IconButton, InputField } from '@/components/ui'
import { api, type PlaylistInfo } from '@/lib/engine'
import { errorMessage, formatClock, isYoutubeUrl } from '@/lib/format'
import { useT } from '@/lib/i18n/I18nProvider'

/** The engine's limits (routes/jobs.py MAX_VIDEOS_PER_REQUEST, ytdlp.PLAYLIST_MAX) */
export const MAX_VIDEOS = 50
const MAX_ROWS = 20

const VIDEO_ID = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/(?:shorts|live|embed|v)\/)([0-9A-Za-z_-]{11})/
const PLAYLIST_ID = /[?&]list=([0-9A-Za-z_-]{10,64})/

export const videoIdOf = (url: string) => url.match(VIDEO_ID)?.[1] ?? null
export const playlistIdOf = (url: string) => (isYoutubeUrl(url) ? url.match(PLAYLIST_ID)?.[1] ?? null : null)

export interface LinkRow {
  key: number
  url: string
  /** The playlist's videos once loaded; `selected` holds youtube ids */
  playlist?: { info: PlaylistInfo; selected: string[] }
}

let nextKey = 1
export const newLinkRow = (url = ''): LinkRow => ({ key: nextKey++, url })

export type LinkProblem = 'url' | 'playlist'

/**
 * The videos the rows stand for, in order and each once: a loaded playlist gives its chosen videos,
 * a link its video. `problems` maps row keys to what is wrong ('playlist': a playlist page not loaded yet).
 */
export function linkVideos(rows: LinkRow[]): { urls: string[]; problems: Record<number, LinkProblem> } {
  const seen = new Map<string, string>()
  const problems: Record<number, LinkProblem> = {}
  for (const row of rows) {
    const url = row.url.trim()
    if (!url) continue
    if (row.playlist) {
      for (const e of row.playlist.info.entries) {
        if (row.playlist.selected.includes(e.youtube_id) && !seen.has(e.youtube_id)) seen.set(e.youtube_id, e.youtube_url)
      }
      continue
    }
    const id = isYoutubeUrl(url) ? videoIdOf(url) : null
    if (id) {
      if (!seen.has(id)) seen.set(id, url)
    } else {
      problems[row.key] = playlistIdOf(url) ? 'playlist' : 'url'
    }
  }
  return { urls: Array.from(seen.values()), problems }
}

interface YoutubeLinksProps {
  rows: LinkRow[]
  onChange: (rows: LinkRow[]) => void
  /** Show each row's problem (after the user tried to start) */
  showErrors?: boolean
}

/** Cari Video's link tab: one or more YouTube links, and the videos of a playlist to pick from. */
export function YoutubeLinks({ rows, onChange, showErrors = false }: YoutubeLinksProps) {
  const t = useT()
  const f = t.discover.form
  const l = f.links
  const [loading, setLoading] = React.useState<number | null>(null)
  const [loadError, setLoadError] = React.useState<Record<number, string>>({})
  const set = (key: number, patch: Partial<LinkRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const { urls, problems } = linkVideos(rows)

  const loadPlaylist = async (row: LinkRow) => {
    setLoading(row.key)
    setLoadError((e) => ({ ...e, [row.key]: '' }))
    try {
      const info = await api.jobs.playlist(row.url.trim())
      set(row.key, { playlist: { info, selected: info.entries.map((e) => e.youtube_id) } })
    } catch (err) {
      setLoadError((e) => ({ ...e, [row.key]: errorMessage(err, l.playlistFailed) }))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mc-stack mc-gap-12">
      {rows.map((row, i) => {
        const problem = problems[row.key]
        const shown = problem && (showErrors || problem === 'playlist') ? problem : null
        const playlistId = playlistIdOf(row.url)
        const pl = row.playlist
        return (
          <div key={row.key} className="mc-stack mc-gap-8">
            <div className="mc-row mc-gap-8" style={{ alignItems: 'flex-end' }}>
              <div className="mc-grow">
                <InputField
                  label={i === 0 ? f.linkLabel : undefined}
                  aria-label={i === 0 ? undefined : l.rowAria(i + 1)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={row.url}
                  onChange={(e) => set(row.key, { url: e.target.value, playlist: undefined })}
                  icon={<Link2 size={18} aria-hidden="true" />}
                  inputSize={i === 0 ? 'lg' : 'md'}
                  autoFocus={i === 0}
                  disabled={!!pl}
                  aria-invalid={shown === 'url' || undefined}
                />
              </div>
              {rows.length > 1 && (
                <IconButton
                  label={l.remove(i + 1)}
                  icon={<Trash2 size={16} aria-hidden="true" />}
                  variant="ghost"
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                />
              )}
            </div>
            {shown === 'url' && rows.length > 1 && (
              <span className="mc-field__error" role="alert">
                {f.invalidUrl}
              </span>
            )}

            {playlistId && !pl && (
              <Alert
                tone="info"
                icon={<ListVideo size={18} aria-hidden="true" />}
                action={
                  <Button variant="secondary" size="sm" loading={loading === row.key} onClick={() => loadPlaylist(row)}>
                    {l.loadPlaylist}
                  </Button>
                }
              >
                {videoIdOf(row.url) ? l.inPlaylist : l.isPlaylist}
                {loadError[row.key] && (
                  <span className="mc-caption" role="alert" style={{ display: 'block', marginTop: 4 }}>
                    {loadError[row.key]}
                  </span>
                )}
              </Alert>
            )}

            {pl && (
              <Card tone="dew" padding="sm" className="mc-stack mc-gap-8">
                <div className="mc-row mc-row--between mc-row--wrap mc-gap-8">
                  <span className="mc-label">{l.playlistTitle(pl.info.title || pl.info.playlist_id, pl.info.entries.length)}</span>
                  <div className="mc-row mc-gap-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        set(row.key, {
                          playlist: { ...pl, selected: pl.selected.length === pl.info.entries.length ? [] : pl.info.entries.map((e) => e.youtube_id) },
                        })
                      }
                    >
                      {pl.selected.length === pl.info.entries.length ? l.selectNone : l.selectAll}
                    </Button>
                    <Button variant="ghost" size="sm" icon={<X size={14} aria-hidden="true" />} onClick={() => set(row.key, { playlist: undefined })}>
                      {l.closePlaylist}
                    </Button>
                  </div>
                </div>
                <ul className="mc-stack mc-gap-4" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 280, overflowY: 'auto' }}>
                  {pl.info.entries.map((e) => (
                    <li key={e.youtube_id}>
                      <label className="mc-row mc-row--top mc-gap-12" style={{ cursor: 'pointer', padding: '4px 0' }}>
                        <input
                          type="checkbox"
                          checked={pl.selected.includes(e.youtube_id)}
                          style={{ marginTop: 3 }}
                          onChange={(ev) =>
                            set(row.key, {
                              playlist: {
                                ...pl,
                                selected: ev.target.checked ? [...pl.selected, e.youtube_id] : pl.selected.filter((id) => id !== e.youtube_id),
                              },
                            })
                          }
                        />
                        <span className="mc-grow" style={{ overflowWrap: 'anywhere' }}>
                          {e.title || e.youtube_id}
                        </span>
                        {e.duration_seconds ? <span className="mc-caption mc-muted mc-mono">{formatClock(e.duration_seconds)}</span> : null}
                      </label>
                    </li>
                  ))}
                </ul>
                {pl.info.more && <span className="mc-caption mc-muted">{l.firstOnly(pl.info.entries.length)}</span>}
              </Card>
            )}
          </div>
        )
      })}

      <div className="mc-row mc-row--wrap mc-gap-12">
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={16} aria-hidden="true" />}
          disabled={rows.length >= MAX_ROWS}
          onClick={() => onChange([...rows, newLinkRow()])}
        >
          {l.add}
        </Button>
        {urls.length > 1 && (
          <span className="mc-caption" aria-live="polite">
            {urls.length > MAX_VIDEOS ? l.tooMany(MAX_VIDEOS) : l.count(urls.length)}
          </span>
        )}
      </div>
    </div>
  )
}
