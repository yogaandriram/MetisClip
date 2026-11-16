import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownToLine, SeparatorHorizontal } from 'lucide-react';
import { Alert, Button, ChoiceChips, ColorPicker, Divider, Field, InputField, SelectField, Slider, Tabs, ToggleSwitch } from '@/components/ui';
import { api } from '@/lib/engine';
import { errorMessage } from '@/lib/format';
import { SUPPORTED_FONTS, FONT_WEIGHTS_MAP } from '@/lib/constants';
import { DEFAULT_POSITION_Y, DESIGN_CANVAS, POSITION_LIMITS, captionHeight } from '@/lib/presets/position';
import {
  LAYOUT_LIMITS,
  type BackgroundType,
  type CompanionPosition,
  type DuoTop,
  type FrameRatio,
  type HeaderSource,
  type Layout,
  type LayoutMode,
  type LayoutPatch,
  type SceneView,
  type SpeakerAlign,
  type TextAlign,
  type ZoomStyle,
  captionUnderFrame,
  duoGeometry,
  frameRect,
  headerCoveredBy,
  headerLines,
  headerRect,
  headerText,
  platformNames,
  splitGeometry,
} from '@/lib/presets/layout';
import type { Messages } from '@/lib/i18n';
import { useT } from '@/lib/i18n/I18nProvider';
import { CaptionSettings, LayoutSettings, SafeZone, safeZoneOptions } from '../types';
import { AssetUploader } from './BrandSettingsPanel';
import { LayoutPresetGallery } from './LayoutPresetGallery';

interface LayoutSettingsPanelProps {
  templateId: string;
  layout: LayoutSettings;
  caption: CaptionSettings;
  /** AI emojis are on (the caption is taller) */
  emoji: boolean;
  /** AI keywords are on (the keyword zoom needs them) */
  keywordsOn: boolean;
  /** The template's brand logo (asset://…), offered as the card avatar */
  brandLogoUrl?: string;
  /** Ratio of the preview's sample video */
  aspect: number;
  updateLayout: (patch: LayoutPatch & { safeZone?: SafeZone }) => void;
  updateCaption: (updates: Partial<CaptionSettings>) => void;
}

export const modeOptions = (t: Messages): { value: LayoutMode; label: string }[] => [
  { value: 'full', label: t.brand.layout.modes.full },
  { value: 'podcast', label: t.brand.layout.modes.podcast },
  { value: 'card', label: t.brand.layout.modes.card },
  { value: 'split', label: t.brand.layout.modes.split },
  { value: 'duo', label: t.brand.layout.modes.duo },
  { value: 'auto', label: t.brand.layout.modes.auto },
];

/** The views of the auto layout, as offered for each kind of scene. */
const viewOptions = (t: Messages): { value: SceneView; label: string }[] => [
  { value: 'duo', label: t.brand.layout.views.duo },
  { value: 'full', label: t.brand.layout.views.full },
  { value: 'framed', label: t.brand.layout.views.framed },
];
const fullOrFramedOptions = (t: Messages): { value: 'full' | 'framed'; label: string }[] => [
  { value: 'full', label: t.brand.layout.views.full },
  { value: 'framed', label: t.brand.layout.views.framed },
];

/** Which speaker goes in the top panel (duo layout), as seen in the source video. */
export const duoTopOptions = (t: Messages): { value: DuoTop; label: string }[] => [
  { value: 'left', label: t.brand.layout.duoTop.left },
  { value: 'right', label: t.brand.layout.duoTop.right },
];

const companionPositionOptions = (t: Messages): { value: CompanionPosition; label: string }[] => [
  { value: 'bottom', label: t.brand.layout.companionPosition.bottom },
  { value: 'top', label: t.brand.layout.companionPosition.top },
];

export const ratioOptions = (t: Messages): { value: FrameRatio; label: string }[] => [
  { value: 'source', label: t.brand.layout.ratioSource },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
];

export const zoomStyleOptions = (t: Messages): { value: ZoomStyle; label: string }[] => [
  { value: 'keywords', label: t.brand.layout.zoomStyle.keywords },
  { value: 'sentences', label: t.brand.layout.zoomStyle.sentences },
];

const backgroundOptions = (t: Messages): { value: BackgroundType; label: string }[] => [
  { value: 'blur', label: t.brand.layout.backgrounds.blur },
  { value: 'color', label: t.brand.layout.backgrounds.color },
  { value: 'gradient', label: t.brand.layout.backgrounds.gradient },
  { value: 'image', label: t.brand.layout.backgrounds.image },
];

const headerSourceOptions = (t: Messages): { value: HeaderSource; label: string }[] => [
  { value: 'title', label: t.brand.layout.headerSource.title },
  { value: 'custom', label: t.brand.layout.headerSource.custom },
];

const alignOptions = (t: Messages): { value: TextAlign; label: string }[] => [
  { value: 'left', label: t.brand.layout.align.left },
  { value: 'center', label: t.brand.layout.align.center },
  { value: 'right', label: t.brand.layout.align.right },
];

const speakerAlignOptions = (t: Messages): { value: SpeakerAlign; label: string }[] => [
  { value: 'left', label: t.brand.layout.align.left },
  { value: 'center', label: t.brand.layout.align.center },
];

function tabsFor(mode: LayoutMode, t: Messages): { id: string; label: string }[] {
  const L = t.brand.layout.tabs;
  switch (mode) {
    case 'podcast':
      return [
        { id: 'video', label: L.video },
        { id: 'background', label: L.background },
        { id: 'header', label: L.header },
        { id: 'credit', label: L.credit },
      ];
    case 'card':
      return [
        { id: 'card', label: L.card },
        { id: 'video', label: L.video },
        { id: 'background', label: L.background },
        { id: 'header', label: L.text },
        { id: 'credit', label: L.credit },
      ];
    case 'split':
      return [
        { id: 'companion', label: L.companion },
        { id: 'credit', label: L.credit },
      ];
    case 'duo':
      return [
        { id: 'duo', label: L.panel },
        { id: 'credit', label: L.credit },
      ];
    case 'auto':
      return [
        { id: 'auto', label: L.scenes },
        { id: 'duo', label: L.panel },
        { id: 'video', label: L.frame },
        { id: 'background', label: L.background },
        { id: 'header', label: L.header },
        { id: 'credit', label: L.credit },
      ];
    default:
      return [];
  }
}

const px = (v: number) => `${Math.round(v)}px`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function layoutSummary(layout: LayoutSettings, t: Messages): string {
  const S = t.brand.layout.summary;
  const bg = backgroundOptions(t).find((o) => o.value === layout.background.type)?.label || '';
  const parts = [
    layout.mode === 'podcast'
      ? S.podcast(bg)
      : layout.mode === 'card'
        ? S.card(bg)
        : layout.mode === 'split'
          ? S.split
          : layout.mode === 'duo'
            ? S.duo
            : layout.mode === 'auto'
              ? S.auto
              : S.full,
  ];
  if (layout.zoom.enabled) parts.push(S.zoom);
  if (layout.speaker.enabled) parts.push(S.speaker);
  return parts.join(' · ');
}

const weightOptionsFor = (family: string, current: string) => {
  const weights = FONT_WEIGHTS_MAP[family] || ['Regular'];
  return (weights.includes(current) ? weights : [current, ...weights]).map((w) => ({ value: w, label: w }));
};

export const LayoutSettingsPanel: React.FC<LayoutSettingsPanelProps> = ({
  templateId,
  layout,
  caption,
  emoji,
  keywordsOn,
  brandLogoUrl,
  aspect,
  updateLayout,
  updateCaption,
}) => {
  const t = useT();
  const L = t.brand.layout;
  const secs = L.secondsShort;
  const [tab, setTab] = useState(''); // '' = the mode's first tab
  const [uploading, setUploading] = useState<'' | 'background' | 'avatar' | 'companion'>('');
  const mode = layout.mode;
  const card = mode === 'card';
  const tabs = tabsFor(mode, t);
  const activeTab = tabs.some((x) => x.id === tab) ? tab : tabs[0]?.id || '';
  const frame = frameRect(layout, aspect);
  const { lines, scale } = headerLines(layout, headerText(layout, t.brand.sample.title));
  const covered = mode === 'podcast' || mode === 'auto' ? headerCoveredBy(headerRect(layout, frame, lines, scale)) : [];
  const h = layout.header;
  const z = layout.zoom;
  const sp = layout.speaker;
  const c = layout.card;
  const m = layout.companion;
  const d = layout.duo;
  const au = layout.auto;

  const upload = async (file: File, kind: 'background' | 'avatar') => {
    if (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error(t.brand.assets.unsupported);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t.brand.assets.tooLarge(20));
      return;
    }
    setUploading(kind);
    const id = toast.loading(t.brand.assets.uploadingToData);
    try {
      const { value } = await api.brandTemplates.uploadAsset(templateId, file, kind);
      if (kind === 'background') updateLayout({ background: { type: 'image', imageUrl: value } });
      else updateLayout({ card: { avatarUrl: value } });
      toast.success(L.imageSavedRemember(kind), { id });
    } catch (err) {
      toast.error(errorMessage(err, t.brand.assets.uploadFailed), { id });
    } finally {
      setUploading('');
    }
  };

  const uploadCompanion = async (file: File) => {
    if (file.type && !['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) {
      toast.error(L.companionUnsupported);
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      toast.error(t.brand.assets.tooLarge(500));
      return;
    }
    setUploading('companion');
    const id = toast.loading(L.companionPreparing);
    try {
      const { value, duration } = await api.brandTemplates.uploadAsset(templateId, file, 'companion');
      updateLayout({ companion: { videoUrl: value, duration: duration || 0 } });
      toast.success(L.companionSaved, { id });
    } catch (err) {
      toast.error(errorMessage(err, L.companionImportFailed), { id });
    } finally {
      setUploading('');
    }
  };

  // Caption centered on the line between the two parts (speaker and companion, or the two speakers)
  const captionOnSeam = () => {
    const g = mode === 'split' ? splitGeometry(layout) : duoGeometry(layout);
    const y = Math.round(DESIGN_CANVAS.height - g.seam - captionHeight(caption, emoji) / 2);
    updateCaption({ positionY: Math.max(POSITION_LIMITS.y.min, Math.min(POSITION_LIMITS.y.max, y)), positionX: 150 });
  };

  const captionUnder = () => {
    const y = captionUnderFrame(frame, captionHeight(caption, emoji), DEFAULT_POSITION_Y);
    updateCaption({ positionY: y, positionX: 150 });
  };

  return (
    <div className="mc-stack mc-gap-20">
      <Field label={L.presetsLabel} hint={L.presetsHint}>
        <LayoutPresetGallery layout={layout} onApply={(next: Layout) => updateLayout(next)} />
      </Field>

      <Divider />

      <Field label={L.modeLabel} hint={L.modeHints[mode]}>
        <ChoiceChips<LayoutMode> ariaLabel={L.modeLabel} options={modeOptions(t)} value={mode} onChange={(m) => updateLayout({ mode: m })} />
      </Field>

      {tabs.length > 0 && (
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setTab}
          ariaLabel={
            card
              ? L.tabsLabel.card
              : mode === 'split'
                ? L.tabsLabel.split
                : mode === 'duo'
                  ? L.tabsLabel.duo
                  : mode === 'auto'
                    ? L.tabsLabel.auto
                    : L.tabsLabel.podcast
          }
          size="sm"
          block
        />
      )}

      {activeTab === 'card' && (
        <div className="mc-stack">
          <div className="mc-row mc-row--top mc-gap-16">
            <InputField
              label={L.card.accountName}
              containerClassName="mc-grow"
              value={c.name}
              maxLength={60}
              placeholder={L.card.accountNamePlaceholder}
              onChange={(e) => updateLayout({ card: { name: e.target.value } })}
            />
            <InputField
              label={L.card.handle}
              containerClassName="mc-grow"
              value={c.handle}
              maxLength={40}
              placeholder={L.card.handlePlaceholder}
              onChange={(e) => updateLayout({ card: { handle: e.target.value } })}
            />
          </div>
          {!c.name.trim() && !c.handle.trim() && (
            <Alert tone="info" title={L.card.noProfileTitle}>
              {L.card.noProfileBody}
            </Alert>
          )}
          <AssetUploader
            title={L.card.avatarTitle}
            description={L.card.avatarDescription}
            accept="image/png,image/jpeg,image/webp"
            formats={t.brand.assets.formats('PNG, JPG, WEBP', 20)}
            current={c.avatarUrl}
            previewImage
            busy={uploading === 'avatar'}
            disabled={!!uploading}
            onFile={(f) => upload(f, 'avatar')}
            onClear={() => updateLayout({ card: { avatarUrl: '' } })}
          />
          {brandLogoUrl && brandLogoUrl !== c.avatarUrl && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => updateLayout({ card: { avatarUrl: brandLogoUrl } })}>
                {L.card.useBrandLogo}
              </Button>
            </div>
          )}
          <ColorPicker label={L.card.cardColor} color={c.color} onChange={(color) => updateLayout({ card: { color } })} />
          <ColorPicker label={L.card.textColor} color={c.textColor} onChange={(textColor) => updateLayout({ card: { textColor } })} />
          <ColorPicker label={L.card.handleColor} color={c.mutedColor} onChange={(mutedColor) => updateLayout({ card: { mutedColor } })} />
          <Slider label={L.card.margin} min={LAYOUT_LIMITS.margin.min} max={LAYOUT_LIMITS.margin.max} value={c.margin} format={px} onChange={(margin) => updateLayout({ card: { margin } })} />
          <Slider label={L.card.radius} min={LAYOUT_LIMITS.radius.min} max={LAYOUT_LIMITS.radius.max} value={c.radius} format={px} onChange={(radius) => updateLayout({ card: { radius } })} />
        </div>
      )}

      {activeTab === 'companion' && (
        <div className="mc-stack">
          <AssetUploader
            title={L.companion.title}
            description={L.companion.description}
            accept="video/mp4,video/quicktime,video/webm"
            formats={t.brand.assets.formats('MP4, MOV, WEBM', 500)}
            current={m.videoUrl}
            busy={uploading === 'companion'}
            disabled={!!uploading}
            onFile={uploadCompanion}
            onClear={() => updateLayout({ companion: { videoUrl: '', duration: 0 } })}
          />
          {!m.videoUrl && (
            <Alert tone="info" title={L.companion.missingTitle}>
              {L.companion.missingBody}
            </Alert>
          )}
          <p className="mc-caption mc-muted">{L.companion.rightsNote}</p>
          <Field label={L.companion.position}>
            <ChoiceChips<CompanionPosition>
              ariaLabel={L.companion.position}
              size="sm"
              options={companionPositionOptions(t)}
              value={m.position}
              onChange={(position) => updateLayout({ companion: { position } })}
            />
          </Field>
          <Slider
            label={L.companion.speakerHeight}
            min={LAYOUT_LIMITS.split.min}
            max={LAYOUT_LIMITS.split.max}
            step={0.01}
            value={m.split}
            format={pct}
            onChange={(split) => updateLayout({ companion: { split } })}
          />
          <Slider
            label={L.companion.focusY}
            min={0}
            max={1}
            step={0.05}
            value={m.focusY}
            format={pct}
            hint={L.companion.focusYHint}
            onChange={(focusY) => updateLayout({ companion: { focusY } })}
          />
          <Slider
            label={L.divider}
            min={LAYOUT_LIMITS.divider.min}
            max={LAYOUT_LIMITS.divider.max}
            value={m.divider}
            format={(v) => (v > 0 ? px(v) : t.common.none)}
            onChange={(divider) => updateLayout({ companion: { divider } })}
          />
          {m.divider > 0 && (
            <ColorPicker label={L.dividerColor} color={m.dividerColor} onChange={(dividerColor) => updateLayout({ companion: { dividerColor } })} />
          )}
          <Button variant="secondary" size="sm" icon={<SeparatorHorizontal size={16} aria-hidden="true" />} onClick={captionOnSeam}>
            {L.captionOnSeam}
          </Button>
        </div>
      )}

      {activeTab === 'auto' && (
        <div className="mc-stack">
          <p className="mc-caption mc-muted">{L.auto.intro}</p>
          <Field label={L.auto.solo}>
            <ChoiceChips<'full' | 'framed'> ariaLabel={L.auto.soloAria} size="sm" options={fullOrFramedOptions(t)} value={au.solo} onChange={(solo) => updateLayout({ auto: { solo } })} />
          </Field>
          <Field label={L.auto.duo}>
            <ChoiceChips<SceneView> ariaLabel={L.auto.duoAria} size="sm" options={viewOptions(t)} value={au.duo} onChange={(duo) => updateLayout({ auto: { duo } })} />
          </Field>
          <Field label={L.auto.group} hint={L.auto.groupHint}>
            <ChoiceChips<'full' | 'framed'> ariaLabel={L.auto.groupAria} size="sm" options={fullOrFramedOptions(t)} value={au.group} onChange={(group) => updateLayout({ auto: { group } })} />
          </Field>
          <Field label={L.auto.none} hint={L.auto.noneHint}>
            <ChoiceChips<'full' | 'framed'> ariaLabel={L.auto.noneAria} size="sm" options={fullOrFramedOptions(t)} value={au.none} onChange={(none) => updateLayout({ auto: { none } })} />
          </Field>
        </div>
      )}

      {activeTab === 'duo' && (
        <div className="mc-stack">
          <p className="mc-caption mc-muted">{L.duo.intro}</p>
          <Field label={L.duo.top} hint={L.duo.topHint}>
            <ChoiceChips<DuoTop> ariaLabel={L.duo.topAria} size="sm" options={duoTopOptions(t)} value={d.top} onChange={(top) => updateLayout({ duo: { top } })} />
          </Field>
          <Slider
            label={L.duo.topHeight}
            min={LAYOUT_LIMITS.split.min}
            max={LAYOUT_LIMITS.split.max}
            step={0.01}
            value={d.split}
            format={pct}
            onChange={(split) => updateLayout({ duo: { split } })}
          />
          <Slider
            label={L.duo.faceSize}
            min={LAYOUT_LIMITS.faceSize.min}
            max={LAYOUT_LIMITS.faceSize.max}
            step={0.01}
            value={d.faceSize}
            format={pct}
            hint={L.duo.faceSizeHint}
            onChange={(faceSize) => updateLayout({ duo: { faceSize } })}
          />
          <Slider
            label={L.divider}
            min={LAYOUT_LIMITS.divider.min}
            max={LAYOUT_LIMITS.divider.max}
            value={d.divider}
            format={(v) => (v > 0 ? px(v) : t.common.none)}
            onChange={(divider) => updateLayout({ duo: { divider } })}
          />
          {d.divider > 0 && (
            <ColorPicker label={L.dividerColor} color={d.dividerColor} onChange={(dividerColor) => updateLayout({ duo: { dividerColor } })} />
          )}
          <Button variant="secondary" size="sm" icon={<SeparatorHorizontal size={16} aria-hidden="true" />} onClick={captionOnSeam}>
            {L.captionOnSeam}
          </Button>
        </div>
      )}

      {activeTab === 'video' && (
        <div className="mc-stack">
          <Field label={L.video.ratio} hint={L.video.ratioHint}>
            <ChoiceChips<FrameRatio> ariaLabel={L.video.ratio} size="sm" options={ratioOptions(t)} value={layout.frame.ratio} onChange={(ratio) => updateLayout({ frame: { ratio } })} />
          </Field>
          <Slider
            label={card ? L.video.cardY : L.video.frameY}
            min={LAYOUT_LIMITS.frameY.min}
            max={LAYOUT_LIMITS.frameY.max}
            value={layout.frame.y}
            format={px}
            onChange={(y) => updateLayout({ frame: { y } })}
            hint={
              card ? L.video.cardYHint : L.video.frameYHint
            }
          />
          {layout.frame.ratio !== 'source' && (
            <Slider label={L.video.focusX} min={0} max={1} step={0.05} value={layout.frame.focusX} format={pct} onChange={(focusX) => updateLayout({ frame: { focusX } })} />
          )}
          {!card && (
            <Slider label={L.video.margin} min={LAYOUT_LIMITS.margin.min} max={LAYOUT_LIMITS.margin.max} value={layout.frame.margin} format={px} onChange={(margin) => updateLayout({ frame: { margin } })} />
          )}
          <Slider
            label={card ? L.video.cardRadius : L.video.frameRadius}
            min={LAYOUT_LIMITS.radius.min}
            max={LAYOUT_LIMITS.radius.max}
            value={layout.frame.radius}
            format={px}
            onChange={(radius) => updateLayout({ frame: { radius } })}
          />
          {!card && (
            <Button variant="secondary" size="sm" icon={<ArrowDownToLine size={16} aria-hidden="true" />} onClick={captionUnder}>
              {L.video.captionUnder}
            </Button>
          )}
        </div>
      )}

      {activeTab === 'background' && (
        <div className="mc-stack">
          <ChoiceChips<BackgroundType>
            ariaLabel={L.background.typeAria}
            size="sm"
            options={backgroundOptions(t)}
            value={layout.background.type}
            onChange={(type) => updateLayout({ background: { type } })}
          />
          {layout.background.type === 'blur' && (
            <Slider label={L.background.blur} min={LAYOUT_LIMITS.blur.min} max={LAYOUT_LIMITS.blur.max} value={layout.background.blur} format={px} onChange={(blur) => updateLayout({ background: { blur } })} />
          )}
          {layout.background.type !== 'blur' && (
            <ColorPicker
              label={layout.background.type === 'gradient' ? L.background.topColor : L.background.color}
              color={layout.background.color}
              onChange={(color) => updateLayout({ background: { color } })}
            />
          )}
          {layout.background.type === 'gradient' && (
            <ColorPicker label={L.background.bottomColor} color={layout.background.color2} onChange={(color2) => updateLayout({ background: { color2 } })} />
          )}
          {layout.background.type === 'image' && (
            <AssetUploader
              title={L.background.imageTitle}
              description={L.background.imageDescription}
              accept="image/png,image/jpeg,image/webp"
              formats={t.brand.assets.formats('PNG, JPG, WEBP', 20)}
              current={layout.background.imageUrl}
              previewImage
              busy={uploading === 'background'}
              disabled={!!uploading}
              onFile={(f) => upload(f, 'background')}
              onClear={() => updateLayout({ background: { imageUrl: '' } })}
            />
          )}
          <Slider label={L.background.dim} min={LAYOUT_LIMITS.dim.min} max={LAYOUT_LIMITS.dim.max} step={0.05} value={layout.background.dim} format={pct} onChange={(dim) => updateLayout({ background: { dim } })} />
        </div>
      )}

      {activeTab === 'header' && (
        <div className="mc-stack">
          <ToggleSwitch
            label={card ? L.header.showPostText : L.header.showTitle}
            checked={h.enabled}
            onChange={(enabled) => updateLayout({ header: { enabled } })}
          />
          {h.enabled && (
            <>
              <Field
                label={card ? L.header.postTextSource : L.header.titleSource}
                hint={h.source === 'title' ? L.header.sourceTitleHint : L.header.sourceCustomHint}
              >
                <ChoiceChips<HeaderSource> ariaLabel={card ? L.header.postTextSource : L.header.titleSource} size="sm" options={headerSourceOptions(t)} value={h.source} onChange={(source) => updateLayout({ header: { source } })} />
              </Field>
              {h.source === 'custom' && (
                <InputField label={L.header.customText} value={h.text} maxLength={200} onChange={(e) => updateLayout({ header: { text: e.target.value } })} placeholder={L.header.customPlaceholder} />
              )}
              <div className="mc-row mc-row--top mc-gap-16">
                <SelectField
                  label={L.header.font}
                  containerClassName="mc-grow"
                  value={h.fontFamily}
                  options={SUPPORTED_FONTS.map((f) => ({ value: f, label: f }))}
                  onChange={(e) => {
                    const f = e.target.value;
                    const available = FONT_WEIGHTS_MAP[f] || ['Regular'];
                    const fontWeight = available.includes(h.fontWeight) ? h.fontWeight : available.includes('Bold') ? 'Bold' : available[0];
                    updateLayout({ header: { fontFamily: f, fontWeight } });
                  }}
                />
                <SelectField
                  label={L.header.weight}
                  containerStyle={{ width: 140, flexShrink: 0 }}
                  value={h.fontWeight}
                  options={weightOptionsFor(h.fontFamily, h.fontWeight)}
                  onChange={(e) => updateLayout({ header: { fontWeight: e.target.value } })}
                />
              </div>
              <Slider
                label={L.header.size}
                min={LAYOUT_LIMITS.headerSize.min}
                max={LAYOUT_LIMITS.headerSize.max}
                value={h.fontSize}
                format={px}
                hint={L.header.sizeHint}
                onChange={(fontSize) => updateLayout({ header: { fontSize } })}
              />
              <Slider label={L.header.maxLines} min={1} max={4} value={h.maxLines} onChange={(maxLines) => updateLayout({ header: { maxLines } })} />
              <Field label={L.header.align}>
                <ChoiceChips<TextAlign> ariaLabel={L.header.align} size="sm" options={alignOptions(t)} value={h.align} onChange={(align) => updateLayout({ header: { align } })} />
              </Field>
              <ToggleSwitch label={L.header.uppercase} checked={h.isUppercase} onChange={(isUppercase) => updateLayout({ header: { isUppercase } })} />
              {!card && (
                <>
                  <ColorPicker label={L.header.textColor} color={h.color} onChange={(color) => updateLayout({ header: { color } })} />
                  <ToggleSwitch label={L.header.box} checked={!!h.boxColor} onChange={(on) => updateLayout({ header: { boxColor: on ? '#000000B3' : '' } })} />
                  {h.boxColor && <ColorPicker label={L.header.boxColor} color={h.boxColor} onChange={(boxColor) => updateLayout({ header: { boxColor } })} />}
                  <Slider label={L.header.gap} min={LAYOUT_LIMITS.headerGap.min} max={LAYOUT_LIMITS.headerGap.max} value={h.gap} format={px} onChange={(gap) => updateLayout({ header: { gap } })} />
                </>
              )}
              {card && <p className="mc-caption mc-muted">{L.header.cardColorsNote}</p>}
              {covered.length > 0 && (
                <Alert tone="warning" title={L.header.coveredTitle}>
                  {L.header.coveredBody(platformNames(covered))}
                </Alert>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'credit' && (
        <div className="mc-stack">
          <ToggleSwitch
            label={L.credit.show}
            hint={L.credit.showHint}
            checked={layout.credit.enabled}
            onChange={(enabled) => updateLayout({ credit: { enabled } })}
          />
          {layout.credit.enabled && (
            <>
              <InputField label={L.credit.text} value={layout.credit.text} maxLength={80} onChange={(e) => updateLayout({ credit: { text: e.target.value } })} />
              <Slider label={L.credit.size} min={LAYOUT_LIMITS.creditSize.min} max={LAYOUT_LIMITS.creditSize.max} value={layout.credit.fontSize} format={px} onChange={(fontSize) => updateLayout({ credit: { fontSize } })} />
              <ColorPicker label={L.credit.color} color={layout.credit.color} onChange={(color) => updateLayout({ credit: { color } })} />
            </>
          )}
        </div>
      )}

      <Divider />

      <div className="mc-stack">
        <ToggleSwitch
          label={L.zoom.toggle}
          hint={L.zoom.toggleHint}
          checked={z.enabled}
          onChange={(enabled) => updateLayout({ zoom: { enabled } })}
        />
        {z.enabled && (
          <>
            <Field
              label={L.zoom.when}
              hint={z.style === 'keywords' ? L.zoom.keywordsHint : L.zoom.sentencesHint}
            >
              <ChoiceChips<ZoomStyle> ariaLabel={L.zoom.when} size="sm" options={zoomStyleOptions(t)} value={z.style} onChange={(style) => updateLayout({ zoom: { style } })} />
            </Field>
            <Slider
              label={L.zoom.amount}
              min={LAYOUT_LIMITS.zoomAmount.min}
              max={LAYOUT_LIMITS.zoomAmount.max}
              step={0.01}
              value={z.amount}
              format={(v) => `${Math.round((1 + v) * 100)}%`}
              onChange={(amount) => updateLayout({ zoom: { amount } })}
            />
            {z.style === 'keywords' && !keywordsOn && (
              <Alert tone="info" title={L.zoom.keywordsOffTitle}>
                {L.zoom.keywordsOffBody(t.brand.ai.keywords, L.zoomStyle.sentences)}
              </Alert>
            )}
          </>
        )}
      </div>

      <Divider />

      <div className="mc-stack">
        <ToggleSwitch
          label={L.speaker.toggle}
          hint={L.speaker.toggleHint}
          checked={sp.enabled}
          onChange={(enabled) => updateLayout({ speaker: { enabled } })}
        />
        {sp.enabled && (
          <>
            <div className="mc-row mc-row--top mc-gap-16">
              <InputField
                label={L.speaker.name}
                containerClassName="mc-grow"
                value={sp.name}
                maxLength={60}
                placeholder={L.speaker.namePlaceholder}
                hint={L.speaker.nameHint}
                onChange={(e) => updateLayout({ speaker: { name: e.target.value } })}
              />
              <InputField
                label={L.speaker.role}
                containerClassName="mc-grow"
                value={sp.role}
                maxLength={60}
                placeholder={L.speaker.rolePlaceholder}
                onChange={(e) => updateLayout({ speaker: { role: e.target.value } })}
              />
            </div>
            <div className="mc-row mc-row--top mc-gap-16">
              <SelectField
                label={L.speaker.font}
                containerClassName="mc-grow"
                value={sp.fontFamily}
                options={SUPPORTED_FONTS.map((f) => ({ value: f, label: f }))}
                onChange={(e) => updateLayout({ speaker: { fontFamily: e.target.value } })}
              />
              <Field label={L.speaker.position} style={{ flex: '0 0 auto', width: 'auto' }}>
                <ChoiceChips<SpeakerAlign> ariaLabel={L.speaker.positionAria} size="sm" options={speakerAlignOptions(t)} value={sp.align} onChange={(align) => updateLayout({ speaker: { align } })} />
              </Field>
            </div>
            <Slider label={L.speaker.size} min={LAYOUT_LIMITS.speakerSize.min} max={LAYOUT_LIMITS.speakerSize.max} value={sp.fontSize} format={px} onChange={(fontSize) => updateLayout({ speaker: { fontSize } })} />
            <Slider
              label={L.speaker.y}
              min={LAYOUT_LIMITS.speakerY.min}
              max={LAYOUT_LIMITS.speakerY.max}
              value={sp.y}
              format={px}
              hint={L.speaker.yHint}
              onChange={(y) => updateLayout({ speaker: { y } })}
            />
            <Slider label={L.speaker.start} min={LAYOUT_LIMITS.speakerStart.min} max={10} step={0.1} value={sp.start} format={secs} onChange={(start) => updateLayout({ speaker: { start } })} />
            <Slider label={L.speaker.duration} min={LAYOUT_LIMITS.speakerDuration.min} max={15} step={0.5} value={sp.duration} format={secs} onChange={(duration) => updateLayout({ speaker: { duration } })} />
            <ColorPicker label={L.speaker.nameBox} color={sp.color} onChange={(color) => updateLayout({ speaker: { color } })} />
            <ColorPicker label={L.speaker.nameText} color={sp.textColor} onChange={(textColor) => updateLayout({ speaker: { textColor } })} />
            <ColorPicker label={L.speaker.roleBox} color={sp.accent} onChange={(accent) => updateLayout({ speaker: { accent } })} />
            <ColorPicker label={L.speaker.roleText} color={sp.accentText} onChange={(accentText) => updateLayout({ speaker: { accentText } })} />
          </>
        )}
      </div>

      <Divider />
      <Field
        label={L.safeZone.label}
        hint={L.safeZone.hint}
      >
        <ChoiceChips<SafeZone>
          ariaLabel={L.safeZone.aria}
          size="sm"
          options={safeZoneOptions(t)}
          value={layout.safeZone || 'none'}
          onChange={(safeZone) => updateLayout({ safeZone })}
        />
      </Field>
    </div>
  );
};
