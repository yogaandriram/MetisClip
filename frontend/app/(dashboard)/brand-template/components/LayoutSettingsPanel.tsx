import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownToLine } from 'lucide-react';
import { Alert, Button, ChoiceChips, ColorPicker, Divider, Field, InputField, SelectField, Slider, Tabs, ToggleSwitch } from '@/components/ui';
import { api } from '@/lib/engine';
import { errorMessage } from '@/lib/format';
import { SUPPORTED_FONTS, FONT_WEIGHTS_MAP } from '@/lib/constants';
import { DEFAULT_POSITION_Y, captionHeight } from '@/lib/presets/position';
import {
  LAYOUT_LIMITS,
  type BackgroundType,
  type FrameRatio,
  type HeaderSource,
  type LayoutMode,
  type LayoutPatch,
  type TextAlign,
  captionUnderFrame,
  frameRect,
  headerCoveredBy,
  headerLines,
  headerRect,
  headerText,
  platformNames,
} from '@/lib/presets/layout';
import { CaptionSettings, LayoutSettings, SAFE_ZONE_OPTIONS, SafeZone } from '../types';
import { AssetUploader } from './BrandSettingsPanel';

interface LayoutSettingsPanelProps {
  templateId: string;
  layout: LayoutSettings;
  caption: CaptionSettings;
  /** AI emojis are on (the caption is taller) */
  emoji: boolean;
  /** Ratio of the preview's sample video */
  aspect: number;
  updateLayout: (patch: LayoutPatch & { safeZone?: SafeZone }) => void;
  updateCaption: (updates: Partial<CaptionSettings>) => void;
}

export const MODE_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: 'full', label: 'Penuh 9:16' },
  { value: 'podcast', label: 'Podcast (rasio asli)' },
];

export const RATIO_OPTIONS: { value: FrameRatio; label: string }[] = [
  { value: 'source', label: 'Asli' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
];

const BACKGROUND_OPTIONS: { value: BackgroundType; label: string }[] = [
  { value: 'blur', label: 'Blur video' },
  { value: 'color', label: 'Warna' },
  { value: 'gradient', label: 'Gradasi' },
  { value: 'image', label: 'Gambar' },
];

const HEADER_SOURCE_OPTIONS: { value: HeaderSource; label: string }[] = [
  { value: 'title', label: 'Judul klip' },
  { value: 'custom', label: 'Teks tetap' },
];

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Kiri' },
  { value: 'center', label: 'Tengah' },
  { value: 'right', label: 'Kanan' },
];

/** Sample title for the Brand Template preview (clips use their own hook text). */
export const SAMPLE_TITLE = 'Rahasia konten viral yang jarang orang tahu';

const px = (v: number) => `${Math.round(v)}px`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function layoutSummary(layout: LayoutSettings): string {
  if (layout.mode !== 'podcast') return 'Penuh 9:16';
  const bg = BACKGROUND_OPTIONS.find((o) => o.value === layout.background.type)?.label || '';
  return `Podcast · ${bg}`;
}

export const LayoutSettingsPanel: React.FC<LayoutSettingsPanelProps> = ({ templateId, layout, caption, emoji, aspect, updateLayout, updateCaption }) => {
  const [tab, setTab] = useState('video');
  const [uploading, setUploading] = useState(false);
  const podcast = layout.mode === 'podcast';
  const frame = frameRect(layout, aspect);
  const sampleHeader = headerText(layout, SAMPLE_TITLE);
  const { lines, scale } = headerLines(layout, sampleHeader);
  const covered = headerCoveredBy(headerRect(layout, frame, lines, scale));
  const h = layout.header;
  const weights = FONT_WEIGHTS_MAP[h.fontFamily] || ['Regular'];
  const weightOptions = weights.includes(h.fontWeight) ? weights : [h.fontWeight, ...weights];

  const uploadBackground = async (file: File) => {
    if (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Format file tidak didukung');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File terlalu besar. Maksimal 20 MB');
      return;
    }
    setUploading(true);
    const id = toast.loading('Mengunggah ke folder data…');
    try {
      const { value } = await api.brandTemplates.uploadAsset(templateId, file, 'background');
      updateLayout({ background: { type: 'image', imageUrl: value } });
      toast.success('Gambar latar tersimpan. Jangan lupa klik Simpan.', { id });
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengunggah file'), { id });
    } finally {
      setUploading(false);
    }
  };

  const captionUnder = () => {
    const y = captionUnderFrame(frame, captionHeight(caption, emoji), DEFAULT_POSITION_Y);
    updateCaption({ positionY: y, positionX: 150 });
  };

  return (
    <div className="mc-stack mc-gap-20">
      <Field
        label="Tampilan video"
        hint={
          podcast
            ? 'Video tampil utuh dengan rasio aslinya di tengah, judul di atas, caption di bawah. Cocok untuk podcast dan wawancara.'
            : 'Video dipotong 9:16 mengikuti wajah pembicara (face tracking).'
        }
      >
        <ChoiceChips<LayoutMode> ariaLabel="Tampilan video" options={MODE_OPTIONS} value={layout.mode} onChange={(mode) => updateLayout({ mode })} />
      </Field>

      {podcast && (
        <>
          <Tabs
            tabs={[
              { id: 'video', label: 'Video' },
              { id: 'background', label: 'Latar' },
              { id: 'header', label: 'Judul' },
              { id: 'credit', label: 'Kredit' },
            ]}
            activeTab={tab}
            onChange={setTab}
            ariaLabel="Pengaturan layout podcast"
            size="sm"
            block
          />

          {tab === 'video' && (
            <div className="mc-stack">
              <Field label="Rasio bingkai" hint="Asli = rasio video sumber. Rasio lain memotong sisi kiri dan kanan video.">
                <ChoiceChips<FrameRatio> ariaLabel="Rasio bingkai" size="sm" options={RATIO_OPTIONS} value={layout.frame.ratio} onChange={(ratio) => updateLayout({ frame: { ratio } })} />
              </Field>
              <Slider
                label="Posisi vertikal"
                min={LAYOUT_LIMITS.frameY.min}
                max={LAYOUT_LIMITS.frameY.max}
                value={layout.frame.y}
                format={px}
                onChange={(y) => updateLayout({ frame: { y } })}
                hint="Jarak bingkai dari atas. Bisa juga digeser langsung di preview."
              />
              {layout.frame.ratio !== 'source' && (
                <Slider label="Fokus horizontal" min={0} max={1} step={0.05} value={layout.frame.focusX} format={pct} onChange={(focusX) => updateLayout({ frame: { focusX } })} />
              )}
              <Slider label="Jarak tepi" min={LAYOUT_LIMITS.margin.min} max={LAYOUT_LIMITS.margin.max} value={layout.frame.margin} format={px} onChange={(margin) => updateLayout({ frame: { margin } })} />
              <Slider label="Sudut membulat" min={LAYOUT_LIMITS.radius.min} max={LAYOUT_LIMITS.radius.max} value={layout.frame.radius} format={px} onChange={(radius) => updateLayout({ frame: { radius } })} />
              <Button variant="secondary" size="sm" icon={<ArrowDownToLine size={16} aria-hidden="true" />} onClick={captionUnder}>
                Taruh caption di bawah video
              </Button>
            </div>
          )}

          {tab === 'background' && (
            <div className="mc-stack">
              <ChoiceChips<BackgroundType>
                ariaLabel="Jenis latar"
                size="sm"
                options={BACKGROUND_OPTIONS}
                value={layout.background.type}
                onChange={(type) => updateLayout({ background: { type } })}
              />
              {layout.background.type === 'blur' && (
                <Slider label="Kekuatan blur" min={LAYOUT_LIMITS.blur.min} max={LAYOUT_LIMITS.blur.max} value={layout.background.blur} format={px} onChange={(blur) => updateLayout({ background: { blur } })} />
              )}
              {(layout.background.type === 'color' || layout.background.type === 'gradient' || layout.background.type === 'image') && (
                <ColorPicker
                  label={layout.background.type === 'gradient' ? 'Warna atas' : 'Warna latar'}
                  color={layout.background.color}
                  onChange={(color) => updateLayout({ background: { color } })}
                />
              )}
              {layout.background.type === 'gradient' && (
                <ColorPicker label="Warna bawah" color={layout.background.color2} onChange={(color2) => updateLayout({ background: { color2 } })} />
              )}
              {layout.background.type === 'image' && (
                <AssetUploader
                  title="Gambar latar"
                  description="Ditampilkan memenuhi layar di belakang video."
                  accept="image/png,image/jpeg,image/webp"
                  formats="PNG, JPG, WEBP · maks. 20 MB"
                  current={layout.background.imageUrl}
                  previewImage
                  busy={uploading}
                  disabled={uploading}
                  onFile={uploadBackground}
                  onClear={() => updateLayout({ background: { imageUrl: '' } })}
                />
              )}
              <Slider label="Gelapkan latar" min={LAYOUT_LIMITS.dim.min} max={LAYOUT_LIMITS.dim.max} step={0.05} value={layout.background.dim} format={pct} onChange={(dim) => updateLayout({ background: { dim } })} />
            </div>
          )}

          {tab === 'header' && (
            <div className="mc-stack">
              <ToggleSwitch label="Tampilkan judul di atas video" checked={h.enabled} onChange={(enabled) => updateLayout({ header: { enabled } })} />
              {h.enabled && (
                <>
                  <Field label="Isi judul" hint={h.source === 'title' ? 'Kutipan pembuka dari AI untuk tiap klip. Bisa diubah per klip di editor.' : 'Teks yang sama di semua klip.'}>
                    <ChoiceChips<HeaderSource> ariaLabel="Isi judul" size="sm" options={HEADER_SOURCE_OPTIONS} value={h.source} onChange={(source) => updateLayout({ header: { source } })} />
                  </Field>
                  {h.source === 'custom' && (
                    <InputField label="Teks judul" value={h.text} maxLength={200} onChange={(e) => updateLayout({ header: { text: e.target.value } })} placeholder="Misal: PODCAST BISNIS" />
                  )}
                  <div className="mc-row mc-row--top mc-gap-16">
                    <SelectField
                      label="Font"
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
                      label="Ketebalan"
                      containerStyle={{ width: 140, flexShrink: 0 }}
                      value={h.fontWeight}
                      options={weightOptions.map((w) => ({ value: w, label: w }))}
                      onChange={(e) => updateLayout({ header: { fontWeight: e.target.value } })}
                    />
                  </div>
                  <Slider
                    label="Ukuran"
                    min={LAYOUT_LIMITS.headerSize.min}
                    max={LAYOUT_LIMITS.headerSize.max}
                    value={h.fontSize}
                    format={px}
                    hint="Judul panjang otomatis mengecil supaya muat."
                    onChange={(fontSize) => updateLayout({ header: { fontSize } })}
                  />
                  <Slider label="Maksimal baris" min={1} max={4} value={h.maxLines} onChange={(maxLines) => updateLayout({ header: { maxLines } })} />
                  <Field label="Rata teks">
                    <ChoiceChips<TextAlign> ariaLabel="Rata teks" size="sm" options={ALIGN_OPTIONS} value={h.align} onChange={(align) => updateLayout({ header: { align } })} />
                  </Field>
                  <ToggleSwitch label="Huruf kapital" checked={h.isUppercase} onChange={(isUppercase) => updateLayout({ header: { isUppercase } })} />
                  <ColorPicker label="Warna teks" color={h.color} onChange={(color) => updateLayout({ header: { color } })} />
                  <ToggleSwitch label="Kotak di belakang teks" checked={!!h.boxColor} onChange={(on) => updateLayout({ header: { boxColor: on ? '#000000B3' : '' } })} />
                  {h.boxColor && <ColorPicker label="Warna kotak" color={h.boxColor} onChange={(boxColor) => updateLayout({ header: { boxColor } })} />}
                  <Slider label="Jarak ke video" min={LAYOUT_LIMITS.headerGap.min} max={LAYOUT_LIMITS.headerGap.max} value={h.gap} format={px} onChange={(gap) => updateLayout({ header: { gap } })} />
                  {covered.length > 0 && (
                    <Alert tone="warning" title="Judul bisa tertutup">
                      Bagian atas judul contoh masuk area menu {platformNames(covered)}. Turunkan bingkai video atau kecilkan judul.
                    </Alert>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'credit' && (
            <div className="mc-stack">
              <ToggleSwitch
                label="Tampilkan sumber video"
                hint="Teks kecil di pojok video. {channel} diganti nama channel YouTube; tidak tampil untuk video upload."
                checked={layout.credit.enabled}
                onChange={(enabled) => updateLayout({ credit: { enabled } })}
              />
              {layout.credit.enabled && (
                <>
                  <InputField label="Teks" value={layout.credit.text} maxLength={80} onChange={(e) => updateLayout({ credit: { text: e.target.value } })} />
                  <Slider label="Ukuran" min={LAYOUT_LIMITS.creditSize.min} max={LAYOUT_LIMITS.creditSize.max} value={layout.credit.fontSize} format={px} onChange={(fontSize) => updateLayout({ credit: { fontSize } })} />
                  <ColorPicker label="Warna teks" color={layout.credit.color} onChange={(color) => updateLayout({ credit: { color } })} />
                </>
              )}
            </div>
          )}
        </>
      )}

      <Divider />
      <Field
        label="Garis bantu platform"
        hint="Area tombol & teks platform di preview, supaya caption, judul dan logo tidak tertutup. Tidak ikut dirender."
      >
        <ChoiceChips<SafeZone>
          ariaLabel="Safe zone platform"
          size="sm"
          options={SAFE_ZONE_OPTIONS}
          value={layout.safeZone || 'none'}
          onChange={(safeZone) => updateLayout({ safeZone })}
        />
      </Field>
    </div>
  );
};
