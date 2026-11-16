'use client'

import React, { useEffect, useRef, useState } from 'react'
import { FileText, ListChecks, MessageSquareText, MonitorPlay, Plus, Target, Trash2, Wallet } from 'lucide-react'
import { Card, CardHeader, Chip, ChoiceChips, Field, InputField, IconButton, SelectField, TagInput, TextAreaField, Button } from '@/components/ui'
import type { Brief, BriefRequirement, BriefRule, BriefRuleStage, BriefRuleType } from '@/lib/engine'
import { useT } from '@/lib/i18n/I18nProvider'
import { COMMON_PLATFORMS, asTag } from './helpers'

const REQUIREMENTS: BriefRequirement[] = ['required', 'optional', 'forbidden']
const RULE_TYPES: BriefRuleType[] = ['must', 'must_not', 'prefer']
const RULE_STAGES: BriefRuleStage[] = ['selection', 'visual', 'post', 'manual']

const toHashtag = asTag('#')
const toMention = asTag('@')

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint: string; children: React.ReactNode }) {
  return (
    <Card as="section">
      <CardHeader size="sm" icon={icon} title={title} subtitle={hint} />
      <div className="mc-stack mc-gap-16">{children}</div>
    </Card>
  )
}

/** "" -> null, otherwise a non-negative number of seconds. */
function seconds(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null
}

function count(value: string): number {
  const n = Math.floor(Number(value))
  return isFinite(n) && n > 0 ? Math.min(10000, n) : 0
}

let ruleSeq = 0
function newRuleId(rules: BriefRule[]): string {
  const taken = new Set(rules.map((r) => r.id))
  let id = ''
  do {
    ruleSeq += 1
    id = `u${Date.now().toString(36)}${ruleSeq}`
  } while (taken.has(id))
  return id
}

function RulesEditor({ rules, onChange }: { rules: BriefRule[]; onChange: (rules: BriefRule[]) => void }) {
  const t = useT()
  const r = t.campaign.form.rules
  const [focusId, setFocusId] = useState<string | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (!focusId) return
    inputs.current[focusId]?.focus()
    setFocusId(null)
  }, [focusId, rules])

  const update = (i: number, patch: Partial<BriefRule>) => onChange(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const add = () => {
    const id = newRuleId(rules)
    onChange([...rules, { id, text: '', type: 'must', stage: 'manual', source: '' }])
    setFocusId(id)
  }

  const typeOptions = RULE_TYPES.map((v) => ({ value: v, label: r.types[v] }))
  const stageOptions = RULE_STAGES.map((v) => ({ value: v, label: r.stages[v] }))

  return (
    <div className="mc-stack mc-gap-12">
      {rules.length === 0 ? (
        <p className="mc-muted">{r.empty}</p>
      ) : (
        <ol className="campaign-rules">
          {rules.map((rule, i) => (
            <li key={rule.id} className="campaign-rule">
              <InputField
                ref={(el) => {
                  inputs.current[rule.id] = el
                }}
                aria-label={r.text(i + 1)}
                value={rule.text}
                maxLength={600}
                placeholder={r.textPlaceholder}
                onChange={(e) => update(i, { text: e.target.value })}
              />
              <div className="mc-row mc-gap-8">
                <SelectField
                  aria-label={r.type(i + 1)}
                  inputSize="sm"
                  options={typeOptions}
                  value={rule.type}
                  onChange={(e) => update(i, { type: e.target.value as BriefRuleType })}
                  containerStyle={{ width: 150, flexShrink: 0 }}
                />
                <SelectField
                  aria-label={r.stage(i + 1)}
                  inputSize="sm"
                  options={stageOptions}
                  value={rule.stage}
                  onChange={(e) => update(i, { stage: e.target.value as BriefRuleStage })}
                  containerStyle={{ width: 200, flexShrink: 0 }}
                />
                <span className="mc-caption mc-subtle mc-grow mc-truncate" title={rule.source || undefined}>
                  {rule.source ? r.from(rule.source) : ''}
                </span>
                <IconButton size="sm" variant="ghost" label={r.remove(i + 1)} icon={<Trash2 size={16} />} onClick={() => onChange(rules.filter((_, j) => j !== i))} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <div>
        <Button variant="secondary" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={add} disabled={rules.length >= 60}>
          {r.add}
        </Button>
      </div>
    </div>
  )
}

interface BriefFormProps {
  value: Brief
  onChange: (brief: Brief) => void
  durationError?: string | null
}

/** The whole brief as editable fields, in the shape the engine stores (models/documents.py Brief). */
export function BriefForm({ value: b, onChange, durationError }: BriefFormProps) {
  const t = useT()
  const f = t.campaign.form

  const set = <K extends keyof Brief>(key: K, v: Brief[K]) => onChange({ ...b, [key]: v })
  const setPost = <K extends keyof Brief['post']>(key: K, v: Brief['post'][K]) => onChange({ ...b, post: { ...b.post, [key]: v } })
  const setVisual = <K extends keyof Brief['visual']>(key: K, v: Brief['visual'][K]) => onChange({ ...b, visual: { ...b.visual, [key]: v } })

  const missingPlatforms = COMMON_PLATFORMS.filter((p) => !b.platforms.some((x) => x.toLowerCase() === p.toLowerCase()))
  const requirementOptions = REQUIREMENTS.map((v) => ({ value: v, label: f.requirement[v] }))

  return (
    <div className="mc-stack mc-gap-20">
      <Section icon={<FileText size={18} aria-hidden="true" />} title={f.sections.overview} hint={f.hints.overview}>
        <TextAreaField
          label={f.summary}
          rows={3}
          maxLength={4000}
          value={b.summary}
          placeholder={f.summaryPlaceholder}
          onChange={(e) => set('summary', e.target.value)}
        />
        <div className="mc-grid">
          <div className="mc-col-8 mc-stack mc-gap-8">
            <TagInput label={f.platforms} value={b.platforms} placeholder={f.platformsPlaceholder} maxLength={80} onChange={(v) => set('platforms', v)} />
            {missingPlatforms.length > 0 && (
              <div className="mc-row mc-row--wrap mc-gap-8">
                {missingPlatforms.map((p) => (
                  <Chip
                    key={p}
                    size="sm"
                    icon={<Plus size={14} aria-hidden="true" />}
                    aria-label={f.addPlatform(p)}
                    onClick={() => set('platforms', [...b.platforms, p])}
                  >
                    {p}
                  </Chip>
                ))}
              </div>
            )}
          </div>
          <InputField
            containerClassName="mc-col-4"
            type="date"
            label={f.deadline}
            hint={f.deadlineHint}
            value={b.deadline || ''}
            onChange={(e) => set('deadline', e.target.value || null)}
          />
        </div>
        <div className="mc-grid">
          <InputField
            containerClassName="mc-col-4"
            label={f.language}
            value={b.language}
            maxLength={300}
            placeholder={f.languagePlaceholder}
            onChange={(e) => set('language', e.target.value)}
          />
          <InputField
            containerClassName="mc-col-4"
            label={f.tone}
            value={b.tone}
            maxLength={300}
            placeholder={f.tonePlaceholder}
            onChange={(e) => set('tone', e.target.value)}
          />
          <InputField
            containerClassName="mc-col-4"
            label={f.audience}
            value={b.audience}
            maxLength={300}
            placeholder={f.audiencePlaceholder}
            onChange={(e) => set('audience', e.target.value)}
          />
        </div>
        <TagInput
          label={f.allowedSources}
          hint={f.allowedSourcesHint}
          value={b.allowed_sources}
          placeholder={f.allowedSourcesPlaceholder}
          onChange={(v) => set('allowed_sources', v)}
        />
      </Section>

      <Section icon={<Target size={18} aria-hidden="true" />} title={f.sections.selection} hint={f.hints.selection}>
        <TagInput label={f.focus} hint={f.focusHint} value={b.focus} placeholder={f.itemPlaceholder} splitOnComma={false} onChange={(v) => set('focus', v)} />
        <TagInput label={f.avoid} hint={f.avoidHint} value={b.avoid} placeholder={f.itemPlaceholder} splitOnComma={false} onChange={(v) => set('avoid', v)} />
        <div className="mc-grid">
          <TagInput
            className="mc-col-6"
            label={f.mustInclude}
            hint={f.mustIncludeHint}
            value={b.must_include}
            placeholder={f.itemPlaceholder}
            onChange={(v) => set('must_include', v)}
          />
          <TagInput
            className="mc-col-6"
            label={f.bannedWords}
            hint={f.bannedWordsHint}
            value={b.banned_words}
            placeholder={f.itemPlaceholder}
            onChange={(v) => set('banned_words', v)}
          />
        </div>
        <div className="mc-grid">
          <InputField
            containerClassName="mc-col-3"
            type="number"
            min={1}
            max={3600}
            mono
            label={f.durationMin}
            value={b.duration.min ?? ''}
            error={durationError || undefined}
            hint={f.durationHint}
            onChange={(e) => set('duration', { ...b.duration, min: seconds(e.target.value) })}
          />
          <InputField
            containerClassName="mc-col-3"
            type="number"
            min={1}
            max={3600}
            mono
            label={f.durationMax}
            value={b.duration.max ?? ''}
            aria-invalid={durationError ? true : undefined}
            onChange={(e) => set('duration', { ...b.duration, max: seconds(e.target.value) })}
          />
          <InputField
            containerClassName="mc-col-3"
            type="number"
            min={0}
            max={10000}
            mono
            label={f.clipsTarget}
            hint={f.clipsTargetHint}
            value={b.clips_target}
            onChange={(e) => set('clips_target', count(e.target.value))}
          />
          <InputField
            containerClassName="mc-col-3"
            type="number"
            min={0}
            max={10000}
            mono
            label={f.maxPerVideo}
            hint={f.maxPerVideoHint}
            value={b.max_per_video}
            onChange={(e) => set('max_per_video', count(e.target.value))}
          />
        </div>
      </Section>

      <Section icon={<MonitorPlay size={18} aria-hidden="true" />} title={f.sections.visual} hint={f.hints.visual}>
        <div className="campaign-requirements">
          {(['subtitles', 'logo', 'credit'] as const).map((key) => (
            <Field key={key} label={f[key]} className="campaign-requirement">
              <ChoiceChips
                size="sm"
                ariaLabel={f[key]}
                options={requirementOptions}
                value={b.visual[key]}
                onChange={(v) => setVisual(key, v)}
              />
            </Field>
          ))}
        </div>
        <TagInput
          label={f.visualNotes}
          value={b.visual.notes}
          placeholder={f.visualNotesPlaceholder}
          splitOnComma={false}
          onChange={(v) => setVisual('notes', v)}
        />
      </Section>

      <Section icon={<MessageSquareText size={18} aria-hidden="true" />} title={f.sections.post} hint={f.hints.post}>
        <div className="mc-grid">
          <TagInput
            className="mc-col-6"
            label={f.hashtags}
            value={b.post.hashtags}
            placeholder={f.hashtagsPlaceholder}
            maxLength={80}
            normalize={toHashtag}
            onChange={(v) => setPost('hashtags', v)}
          />
          <TagInput
            className="mc-col-6"
            label={f.mentions}
            value={b.post.mentions}
            placeholder={f.mentionsPlaceholder}
            maxLength={80}
            normalize={toMention}
            onChange={(v) => setPost('mentions', v)}
          />
        </div>
        <div className="mc-grid">
          <InputField
            containerClassName="mc-col-6"
            label={f.cta}
            value={b.post.cta}
            maxLength={300}
            placeholder={f.ctaPlaceholder}
            onChange={(e) => setPost('cta', e.target.value)}
          />
          <InputField
            containerClassName="mc-col-6"
            label={f.disclosure}
            hint={f.disclosureHint}
            value={b.post.disclosure}
            maxLength={300}
            placeholder={f.disclosurePlaceholder}
            onChange={(e) => setPost('disclosure', e.target.value)}
          />
        </div>
        <TagInput
          label={f.captionRules}
          value={b.post.caption_rules}
          placeholder={f.captionRulesPlaceholder}
          splitOnComma={false}
          onChange={(v) => setPost('caption_rules', v)}
        />
      </Section>

      <Section icon={<ListChecks size={18} aria-hidden="true" />} title={f.sections.rules} hint={f.hints.rules}>
        <RulesEditor rules={b.rules} onChange={(rules) => set('rules', rules)} />
      </Section>

      <Section icon={<Wallet size={18} aria-hidden="true" />} title={f.sections.info} hint={f.hints.info}>
        <div className="mc-grid">
          <TextAreaField
            containerClassName="mc-col-6"
            label={f.payout}
            rows={3}
            maxLength={4000}
            value={b.payout}
            placeholder={f.payoutPlaceholder}
            onChange={(e) => set('payout', e.target.value)}
          />
          <TextAreaField
            containerClassName="mc-col-6"
            label={f.submission}
            rows={3}
            maxLength={4000}
            value={b.submission}
            placeholder={f.submissionPlaceholder}
            onChange={(e) => set('submission', e.target.value)}
          />
        </div>
      </Section>
    </div>
  )
}
