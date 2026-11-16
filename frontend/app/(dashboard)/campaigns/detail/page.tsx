'use client'

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Megaphone, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Badge, Button, ButtonLink, ConfirmModal, EmptyState, PageHeader, Skeleton } from '@/components/ui'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, EngineError, type Brief, type BrandTemplate, type Campaign, type CampaignInput } from '@/lib/engine'
import { errorMessage, formatDateTime } from '@/lib/format'
import { tm } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'
import { BriefForm } from '../components/BriefForm'
import { DraftCard } from '../components/DraftCard'
import { DetailsCard, ProgressCard, QuestionsCard, detailsOf, sameDetails, type CampaignDetails } from '../components/SideCards'
import { SourcesCard } from '../components/SourcesCard'
import { emptyBrief, fullBrief } from '../components/helpers'

type FormSource = 'saved' | 'draft'
type LoadState = 'loading' | 'ready' | 'missing' | 'error'

function DetailSkeleton() {
  return (
    <div className="mc-grid">
      <div className="mc-col-8 mc-stack mc-gap-20">
        <Skeleton height={420} radius="lg" />
        <Skeleton height={360} radius="lg" />
      </div>
      <div className="mc-col-4 mc-stack mc-gap-20">
        <Skeleton height={380} radius="lg" />
        <Skeleton height={240} radius="lg" />
      </div>
    </div>
  )
}

export default function CampaignDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CampaignDetail />
    </Suspense>
  )
}

function CampaignDetail() {
  const t = useT()
  const m = t.campaign
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get('id') || ''
  const { epoch } = useEngine()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [templates, setTemplates] = useState<BrandTemplate[]>([])

  // The brief form, where it was loaded from, and that content (to tell the user's own edits apart)
  const [form, setForm] = useState<Brief>(emptyBrief)
  const [formFrom, setFormFrom] = useState<FormSource>('saved')
  const [loadedJson, setLoadedJson] = useState(() => JSON.stringify(emptyBrief()))
  const [details, setDetails] = useState<CampaignDetails>({ name: '', client: '', brand_template_id: null })

  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [confirmLoad, setConfirmLoad] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deletingRef = useRef(false)

  const live = useRef({ campaign, form, formFrom, loadedJson, details })
  live.current = { campaign, form, formFrom, loadedJson, details }

  const loadForm = useCallback((c: Campaign, from: FormSource) => {
    const useDraft = from === 'draft' && !!c.draft
    const brief = fullBrief(useDraft ? c.draft!.brief : c.brief)
    setForm(brief)
    setFormFrom(useDraft ? 'draft' : 'saved')
    setLoadedJson(JSON.stringify(brief))
  }, [])

  /** First load: everything from the engine; a reading waiting for review opens in the form. */
  const load = useCallback(async () => {
    if (!id) {
      setState('missing')
      return
    }
    setState('loading')
    try {
      const { campaign: c } = await api.campaigns.get(id)
      setCampaign(c)
      setDetails(detailsOf(c))
      loadForm(c, c.draft ? 'draft' : 'saved')
      setState('ready')
    } catch (err) {
      if (err instanceof EngineError && err.status === 404) {
        setState('missing')
      } else {
        setLoadError(errorMessage(err, tm().campaign.detail.loadFailed))
        setState('error')
      }
    }
  }, [id, loadForm])

  /**
   * Later updates (events, engine restart): take the engine's campaign, but never overwrite what the
   * user is editing. A finished reading opens in the form when the form has no edits of its own.
   */
  const refresh = useCallback(
    async (readingDone = false) => {
      if (!id) return
      let c: Campaign
      try {
        c = (await api.campaigns.get(id)).campaign
      } catch (err) {
        if (err instanceof EngineError && err.status === 404 && !deletingRef.current) setState('missing')
        return
      }
      const prev = live.current
      setCampaign(c)
      if (!prev.campaign || sameDetails(prev.details, detailsOf(prev.campaign))) setDetails(detailsOf(c))
      const edited = JSON.stringify(prev.form) !== prev.loadedJson
      if (readingDone && c.draft) {
        if (!edited) {
          loadForm(c, 'draft')
          toast.success(tm().campaign.read.doneToast)
        } else {
          toast(tm().campaign.read.doneEditedToast)
        }
        return
      }
      if (edited) return
      if (prev.formFrom === 'draft' && !c.draft) loadForm(c, 'saved')
      else if (prev.formFrom === 'saved' && JSON.stringify(fullBrief(c.brief)) !== prev.loadedJson) loadForm(c, 'saved')
    },
    [id, loadForm],
  )

  useEffect(() => {
    load()
  }, [load])

  // Engine restarted: refresh without dropping edits
  const epochRef = useRef(epoch)
  useEffect(() => {
    if (epoch === epochRef.current) return
    epochRef.current = epoch
    refresh()
  }, [epoch, refresh])

  useEffect(() => {
    api.brandTemplates
      .list()
      .then(({ brand_templates }) => setTemplates(brand_templates))
      .catch(() => setTemplates([]))
  }, [epoch])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  useEngineEvents((event) => {
    if (!('id' in event) || event.id !== id) return
    if (event.type === 'campaign.deleted') {
      if (deletingRef.current) return
      toast(tm().campaign.detail.deletedElsewhere)
      router.replace('/campaigns/')
    } else if (event.type === 'campaign.parse') {
      setCampaign((c) => (c ? { ...c, parse: { ...c.parse, status: event.status, message: event.message } } : c))
      if (event.status === 'done') refresh(true)
      else if (event.status === 'failed') {
        toast.error(tm().campaign.read.failedToast)
        refresh()
      }
    } else if (event.type === 'campaign.updated') {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => refresh(), 250)
    }
  })

  // ---- Derived state ------------------------------------------------------

  const detailsChanged = !!campaign && !sameDetails(details, detailsOf(campaign))
  const briefChanged = !!campaign && JSON.stringify(form) !== JSON.stringify(fullBrief(campaign.brief))
  const draftInForm = formFrom === 'draft' && !!campaign?.draft
  const canSave = !!campaign && (detailsChanged || briefChanged || draftInForm)
  const formEdited = JSON.stringify(form) !== loadedJson

  const nameError = !details.name.trim() ? m.info.nameRequired : null
  const durationError =
    form.duration.min != null && form.duration.max != null && form.duration.min > form.duration.max ? m.form.durationInvalid : null

  // ---- Actions ------------------------------------------------------------

  const save = async () => {
    if (!campaign || saving || !canSave) return
    if (nameError || durationError) {
      toast.error(m.detail.fixErrors)
      return
    }
    setSaving(true)
    try {
      const patch: CampaignInput = {}
      if (detailsChanged) {
        patch.name = details.name.trim()
        patch.client = details.client.trim()
        patch.brand_template_id = details.brand_template_id
      }
      // Saving a reviewed reading also clears it from the engine
      if (briefChanged || draftInForm) patch.brief = form
      const { campaign: c } = await api.campaigns.update(campaign.id, patch)
      setCampaign(c)
      setDetails(detailsOf(c))
      if (patch.brief) loadForm(c, 'saved')
      toast.success(m.detail.saved)
    } catch (err) {
      toast.error(errorMessage(err, m.detail.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  // Ctrl+S
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const loadDraft = () => {
    if (!campaign?.draft) return
    if (formEdited) setConfirmLoad(true)
    else loadForm(campaign, 'draft')
  }

  const discardDraft = async () => {
    if (!campaign) return
    try {
      const { campaign: c } = await api.campaigns.discardDraft(campaign.id)
      setCampaign(c)
      if (formFrom === 'draft') loadForm(c, 'saved')
      toast.success(m.draft.discarded)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const toggleArchive = async () => {
    if (!campaign) return
    const next = campaign.status === 'archived' ? 'active' : 'archived'
    setArchiving(true)
    try {
      const { campaign: c } = await api.campaigns.update(campaign.id, { status: next })
      setCampaign(c)
      toast.success(next === 'archived' ? m.info.archived(c.name) : m.info.unarchived(c.name))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setArchiving(false)
    }
  }

  const deleteCampaign = async () => {
    if (!campaign) return
    setDeleting(true)
    deletingRef.current = true
    try {
      await api.campaigns.remove(campaign.id)
      toast.success(m.info.deleted(campaign.name))
      setConfirmDelete(false)
      router.push('/campaigns/')
    } catch (err) {
      deletingRef.current = false
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  // ---- Render -------------------------------------------------------------

  const back = { href: '/campaigns/', label: m.detail.back }

  if (state === 'missing') {
    return (
      <>
        <PageHeader title={m.detail.notFoundTitle} back={back} />
        <EmptyState
          icon={Megaphone}
          title={m.detail.notFoundTitle}
          description={m.detail.notFoundText}
          action={
            <ButtonLink href="/campaigns/" variant="secondary">
              {m.detail.toList}
            </ButtonLink>
          }
        />
      </>
    )
  }

  if (state === 'error') {
    return (
      <>
        <PageHeader title={m.title} back={back} />
        <Alert
          tone="error"
          title={m.detail.loadErrorTitle}
          action={
            <Button variant="secondary" size="sm" onClick={load}>
              {t.common.retry}
            </Button>
          }
        >
          {loadError}
        </Alert>
      </>
    )
  }

  if (state === 'loading' || !campaign) {
    return (
      <>
        <PageHeader title={m.title} back={back} />
        <DetailSkeleton />
      </>
    )
  }

  return (
    <>
      <PageHeader
        back={back}
        title={campaign.name}
        subtitle={m.detail.subtitle(campaign.version, formatDateTime(campaign.updated_at))}
        actions={
          <>
            {canSave && (
              <Badge tone="warning" size="sm">
                {m.detail.unsaved}
              </Badge>
            )}
            <Button variant="primary" onClick={save} loading={saving} disabled={!canSave} icon={<Save size={16} aria-hidden="true" />}>
              {t.common.save}
            </Button>
          </>
        }
      />

      <div className="mc-grid campaign-layout">
        <div className="mc-col-8 mc-stack mc-gap-20">
          <SourcesCard campaign={campaign} onCampaign={setCampaign} />
          {campaign.draft && (
            <DraftCard
              campaign={campaign}
              inForm={draftInForm}
              name={details.name}
              client={details.client}
              onLoad={loadDraft}
              onDiscard={discardDraft}
              onUseName={(name) => setDetails((d) => ({ ...d, name }))}
              onUseClient={(client) => setDetails((d) => ({ ...d, client }))}
            />
          )}
          <BriefForm value={form} onChange={setForm} durationError={durationError} />
        </div>

        <aside className="mc-col-4 mc-stack mc-gap-20">
          <DetailsCard
            campaign={campaign}
            details={details}
            onDetails={setDetails}
            templates={templates}
            nameError={nameError}
            archiving={archiving}
            onToggleArchive={toggleArchive}
            onDelete={() => setConfirmDelete(true)}
          />
          <ProgressCard campaign={campaign} />
          <QuestionsCard questions={form.questions} onChange={(questions) => setForm((f) => ({ ...f, questions }))} />
        </aside>
      </div>

      <ConfirmModal
        isOpen={confirmLoad}
        title={m.draft.loadTitle}
        message={m.draft.loadBody}
        confirmLabel={m.draft.loadConfirm}
        danger
        onConfirm={() => {
          setConfirmLoad(false)
          if (campaign.draft) loadForm(campaign, 'draft')
        }}
        onClose={() => setConfirmLoad(false)}
      />

      <ConfirmModal
        isOpen={confirmDelete}
        title={m.info.deleteTitle(campaign.name)}
        message={m.info.deleteBody(campaign.clip_count || 0)}
        confirmLabel={m.info.deleteConfirm}
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        danger
        loading={deleting}
        onConfirm={deleteCampaign}
        onClose={() => !deleting && setConfirmDelete(false)}
      />
    </>
  )
}
