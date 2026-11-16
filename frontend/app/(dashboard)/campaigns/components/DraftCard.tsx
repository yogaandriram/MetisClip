'use client'

import React, { useState } from 'react'
import { Eye, FileInput, ScanText, X } from 'lucide-react'
import { Alert, Badge, Button, Card, CardHeader } from '@/components/ui'
import type { Campaign, LlmProvider } from '@/lib/engine'
import { formatDateTime } from '@/lib/format'
import { providerInfo } from '@/lib/llmProviders'
import { useT } from '@/lib/i18n/I18nProvider'

interface DraftCardProps {
  campaign: Campaign
  /** The brief form currently shows this reading */
  inForm: boolean
  name: string
  client: string
  onLoad: () => void
  onDiscard: () => Promise<void>
  onUseName: (name: string) => void
  onUseClient: (client: string) => void
}

/** The AI's reading of the brief, waiting for review: how it was read, what it could not read, suggestions. */
export function DraftCard({ campaign, inForm, name, client, onLoad, onDiscard, onUseName, onUseClient }: DraftCardProps) {
  const t = useT()
  const m = t.campaign.draft
  const [discarding, setDiscarding] = useState(false)
  const draft = campaign.draft
  if (!draft) return null
  const parse = campaign.parse || { status: 'idle' }
  const model = parse.provider && parse.model ? parse.model : ''
  const provider = parse.provider ? providerInfo(parse.provider as LlmProvider).label : ''
  const meta = draft.at || model ? m.readMeta(draft.at ? formatDateTime(draft.at) : '', model, provider) : ''
  const suggestedName = draft.name?.trim() && draft.name.trim() !== name.trim() ? draft.name.trim() : ''
  const suggestedClient = draft.client?.trim() && draft.client.trim() !== client.trim() ? draft.client.trim() : ''

  const discard = async () => {
    setDiscarding(true)
    try {
      await onDiscard()
    } finally {
      setDiscarding(false)
    }
  }

  return (
    <Card as="section" tone="dew">
      <CardHeader size="sm" icon={<ScanText size={18} aria-hidden="true" />} title={m.title} subtitle={meta || undefined} />
      <div className="mc-stack">
        {(parse.used_ocr || parse.used_vision) && (
          <div className="mc-row mc-row--wrap mc-gap-8">
            {parse.used_ocr && (
              <Badge size="sm" icon={<ScanText size={14} aria-hidden="true" />}>
                {m.ocr}
              </Badge>
            )}
            {parse.used_vision && (
              <Badge size="sm" icon={<Eye size={14} aria-hidden="true" />}>
                {m.vision}
              </Badge>
            )}
          </div>
        )}

        <p>{inForm ? m.inForm : m.notInForm}</p>

        {(suggestedName || suggestedClient) && (
          <div className="mc-stack mc-gap-8">
            {suggestedName && (
              <div className="mc-row mc-gap-12">
                <span className="mc-grow mc-truncate" title={suggestedName}>
                  {m.nameSuggestion(suggestedName)}
                </span>
                <Button variant="secondary" size="sm" onClick={() => onUseName(suggestedName.slice(0, 80))}>
                  {m.use}
                </Button>
              </div>
            )}
            {suggestedClient && (
              <div className="mc-row mc-gap-12">
                <span className="mc-grow mc-truncate" title={suggestedClient}>
                  {m.clientSuggestion(suggestedClient)}
                </span>
                <Button variant="secondary" size="sm" onClick={() => onUseClient(suggestedClient.slice(0, 80))}>
                  {m.use}
                </Button>
              </div>
            )}
          </div>
        )}

        {draft.unreadable?.length > 0 && (
          <Alert tone="warning" title={m.unreadableTitle}>
            <ul className="campaign-list">
              {draft.unreadable.map((piece) => (
                <li key={piece}>{piece}</li>
              ))}
            </ul>
            <p>{m.unreadableText}</p>
          </Alert>
        )}

        <div className="mc-row mc-row--end mc-gap-8">
          <Button variant="ghost" size="sm" icon={<X size={16} aria-hidden="true" />} onClick={discard} loading={discarding}>
            {m.discard}
          </Button>
          {!inForm && (
            <Button variant="secondary" size="sm" icon={<FileInput size={16} aria-hidden="true" />} onClick={onLoad}>
              {m.load}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
