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
  type Layout,
  type LayoutMode,
  type LayoutPatch,
  type SpeakerAlign,
  type TextAlign,
  type ZoomStyle,
  captionUnderFrame,
  frameRect,
  headerCoveredBy,
  headerLines,
  headerRect,
  headerText,
  platformNames,
} from '@/lib/presets/layout';
import { CaptionSettings, LayoutSettings, SAFE_ZONE_OPTIONS, SAMPLE_TITLE, SafeZone } from '../types';
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

export const MODE_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: 'full', label: 'Penuh 9:16' },
  { value: 'podcast', label: 'Podcast (rasio asli)' },
  { value: 'card', label: 'Kartu postingan' },
];

export const RATIO_OPTIONS: { value: FrameRatio; label: string }[] = [
  { value: 'source', label: 'Asli' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
];

export const ZOOM_STYLE_OPTIONS: { value: ZoomStyle; label: string }[] = [
  { value: 'keywords', label: 'Di kata kunci' },
  { value: 'sentences', label: 'Tiap kalimat' },
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

const SPEAKER_ALIGN_OPTIONS: { value: SpeakerAlign; label: string }[] = [
  { value: 'left', label: 'Kiri' },
  { value: 'center', label: 'Tengah' },
];

const MODE_HINTS: Record<LayoutMode, string> = {
  full: 'Video dipotong 9:16 mengikuti wajah pembicara (face tracking).',
  podcast: 'Video tampil utuh dengan rasio aslinya di tengah, judul di atas, caption di bawah. Cocok untuk podcast dan wawancara.',
  card: 'Video di dalam kartu bergaya postingan: foto profil, nama akun, judul sebagai teks postingan, lalu videonya.',
};

const TABS: Record<LayoutMode, { id: string; label: string }[]> = {
  full: [],
  podcast: [
    { id: 'video', label: 'Video' },
    { id: 'background', label: 'Latar' },
    { id: 'header', label: 'Judul' },
    { id: 'credit', label: 'Kredit' },
  ],
  card: [
    { id: 'card', label: 'Kartu' },
    { id: 'video', label: 'Video' },
    { id: 'background', label: 'Latar' },
    { id: 'header', label: 'Teks' },
    { id: 'credit', label: 'Kredit' },
  ],
};

const px = (v: number) => `${Math.round(v)}px`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => `${v.toFixed(1).replace('.', ',')} dtk`;

export function layoutSummary(layout: LayoutSettings): string {
  const bg = BACKGROUND_OPTIONS.find((o) => o.value === layout.background.type)?.label || '';
  const parts = [layout.mode === 'podcast' ? `Podcast · ${bg}` : layout.mode === 'card' ? `Kartu · ${bg}` : 'Penuh 9:16'];
  if (layout.zoom.enabled) parts.push('Zoom');
  if (layout.speaker.enabled) parts.push('Nama pembicara');
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
  const [tab, setTab] = useState('video');
  const [uploading, setUploading] = useState<'' | 'background' | 'avatar'>('');
  const mode = layout.mode;
  const card = mode === 'card';
  const tabs = TABS[mode];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id || '';
  const frame = frameRect(layout, aspect);
  const { lines, scale } = headerLines(layout, headerText(layout, SAMPLE_TITLE));
  const covered = mode === 'podcast' ? headerCoveredBy(headerRect(layout, frame, lines, scale)) : [];
  const h = layout.header;
  const z = layout.zoom;
  const sp = layout.speaker;
  const c = layout.card;

  const upload = async (file: File, kind: 'background' | 'avatar') => {
    if (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Format file tidak didukung');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File terlalu besar. Maksimal 20 MB');
      return;
    }
    setUploading(kind);
    const id = toast.loading('Mengunggah ke folder data…');
    try {
      const { value } = await api.brandTemplates.uploadAsset(templateId, file, kind);
      if (kind === 'background') updateLayout({ background: { type: 'image', imageUrl: value } });
      else updateLayout({ card: { avatarUrl: value } });
      toast.success(`${kind === 'background' ? 'Gambar latar' : 'Foto profil'} tersimpan. Jangan lupa klik Simpan.`, { id });
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengunggah file'), { id });
    } finally {
      setUploading('');
    }
  };

  const captionUnder = () => {
    const y = captionUnderFrame(frame, captionHeight(caption, emoji), DEFAULT_POSITION_Y);
    updateCaption({ positionY: y, positionX: 150 });
  };

  return (
    <div className="mc-stack mc-gap-20">
      <Field label="Preset layout" hint="Satu klik untuk gaya siap pakai. Nama akun, teks tetap, kredit dan nama pembicara tidak ikut berubah.">
        <LayoutPresetGallery layout={layout} onApply={(next: Layout) => updateLayout(next)} />
      </Field>

      <Divider />

      <Field label="Tampilan video" hint={MODE_HINTS[mode]}>
        <ChoiceChips<LayoutMode> ariaLabel="Tampilan video" options={MODE_OPTIONS} value={mode} onChange={(m) => updateLayout({ mode: m })} />
      </Field>

      {tabs.length > 0 && (
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setTab} ariaLabel={card ? 'Pengaturan kartu' : 'Pengaturan layout podcast'} size="sm" block />
      )}

      {activeTab === 'card' && (
        <div className="mc-stack">
          <div className="mc-row mc-row--top mc-gap-16">
            <InputField
              label="Nama akun"
              containerClassName="mc-grow"
              value={c.name}
              maxLength={60}
              placeholder="Misal: Klip Bisnis"
              onChange={(e) => updateLayout({ card: { name: e.target.value } })}
            />
            <InputField
              label="Handle"
              containerClassName="mc-grow"
              value={c.handle}
              maxLength={40}
              placeholder="@klipbisnis"
              onChange={(e) => updateLayout({ card: { handle: e.target.value } })}
            />
          </div>
          {!c.name.trim() && !c.handle.trim() && (
            <Alert tone="info" title="Baris profil belum tampil">
              Isi nama akun atau handle supaya kartu terlihat seperti postingan. Pakai akun Anda sendiri, bukan nama orang lain.
            </Alert>
          )}
          <AssetUploader
            title="Foto profil"
            description="Bulat di kiri nama akun. Tanpa foto, huruf pertama nama yang tampil."
            accept="image/png,image/jpeg,image/webp"
            formats="PNG, JPG, WEBP · maks. 20 MB"
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
                Pakai logo brand sebagai foto profil
              </Button>
            </div>
          )}
          <ColorPicker label="Warna kartu" color={c.color} onChange={(color) => updateLayout({ card: { color } })} />
          <ColorPicker label="Warna teks" color={c.textColor} onChange={(textColor) => updateLayout({ card: { textColor } })} />
          <ColorPicker label="Warna handle" color={c.mutedColor} onChange={(mutedColor) => updateLayout({ card: { mutedColor } })} />
          <Slider label="Jarak tepi" min={LAYOUT_LIMITS.margin.min} max={LAYOUT_LIMITS.margin.max} value={c.margin} format={px} onChange={(margin) => updateLayout({ card: { margin } })} />
          <Slider label="Sudut kartu" min={LAYOUT_LIMITS.radius.min} max={LAYOUT_LIMITS.radius.max} value={c.radius} format={px} onChange={(radius) => updateLayout({ card: { radius } })} />
        </div>
      )}

      {activeTab === 'video' && (
        <div className="mc-stack">
          <Field label="Rasio video" hint="Asli = rasio video sumber. Rasio lain memotong sisi kiri dan kanan video.">
            <ChoiceChips<FrameRatio> ariaLabel="Rasio video" size="sm" options={RATIO_OPTIONS} value={layout.frame.ratio} onChange={(ratio) => updateLayout({ frame: { ratio } })} />
          </Field>
          <Slider
            label={card ? 'Posisi kartu' : 'Posisi vertikal'}
            min={LAYOUT_LIMITS.frameY.min}
            max={LAYOUT_LIMITS.frameY.max}
            value={layout.frame.y}
            format={px}
            onChange={(y) => updateLayout({ frame: { y } })}
            hint={
              card
                ? 'Jarak kartu dari atas. Kartu yang terlalu panjang naik sendiri supaya tidak tertutup teks platform.'
                : 'Jarak bingkai dari atas. Bisa juga digeser langsung di preview.'
            }
          />
          {layout.frame.ratio !== 'source' && (
            <Slider label="Fokus horizontal" min={0} max={1} step={0.05} value={layout.frame.focusX} format={pct} onChange={(focusX) => updateLayout({ frame: { focusX } })} />
          )}
          {!card && (
            <Slider label="Jarak tepi" min={LAYOUT_LIMITS.margin.min} max={LAYOUT_LIMITS.margin.max} value={layout.frame.margin} format={px} onChange={(margin) => updateLayout({ frame: { margin } })} />
          )}
          <Slider
            label={card ? 'Sudut video' : 'Sudut membulat'}
            min={LAYOUT_LIMITS.radius.min}
            max={LAYOUT_LIMITS.radius.max}
            value={layout.frame.radius}
            format={px}
            onChange={(radius) => updateLayout({ frame: { radius } })}
          />
          {!card && (
            <Button variant="secondary" size="sm" icon={<ArrowDownToLine size={16} aria-hidden="true" />} onClick={captionUnder}>
              Taruh caption di bawah video
            </Button>
          )}
        </div>
      )}

      {activeTab === 'background' && (
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
          {layout.background.type !== 'blur' && (
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
              busy={uploading === 'background'}
              disabled={!!uploading}
              onFile={(f) => upload(f, 'background')}
              onClear={() => updateLayout({ background: { imageUrl: '' } })}
            />
          )}
          <Slider label="Gelapkan latar" min={LAYOUT_LIMITS.dim.min} max={LAYOUT_LIMITS.dim.max} step={0.05} value={layout.background.dim} format={pct} onChange={(dim) => updateLayout({ background: { dim } })} />
        </div>
      )}

      {activeTab === 'header' && (
        <div className="mc-stack">
          <ToggleSwitch
            label={card ? 'Tampilkan teks postingan' : 'Tampilkan judul di atas video'}
            checked={h.enabled}
            onChange={(enabled) => updateLayout({ header: { enabled } })}
          />
          {h.enabled && (
            <>
              <Field
                label={card ? 'Isi teks' : 'Isi judul'}
                hint={h.source === 'title' ? 'Kutipan pembuka dari AI untuk tiap klip. Bisa diubah per klip di editor.' : 'Teks yang sama di semua klip.'}
              >
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
                  options={weightOptionsFor(h.fontFamily, h.fontWeight)}
                  onChange={(e) => updateLayout({ header: { fontWeight: e.target.value } })}
                />
              </div>
              <Slider
                label="Ukuran"
                min={LAYOUT_LIMITS.headerSize.min}
                max={LAYOUT_LIMITS.headerSize.max}
                value={h.fontSize}
                format={px}
                hint="Teks panjang otomatis mengecil supaya muat."
                onChange={(fontSize) => updateLayout({ header: { fontSize } })}
              />
              <Slider label="Maksimal baris" min={1} max={4} value={h.maxLines} onChange={(maxLines) => updateLayout({ header: { maxLines } })} />
              <Field label="Rata teks">
                <ChoiceChips<TextAlign> ariaLabel="Rata teks" size="sm" options={ALIGN_OPTIONS} value={h.align} onChange={(align) => updateLayout({ header: { align } })} />
              </Field>
              <ToggleSwitch label="Huruf kapital" checked={h.isUppercase} onChange={(isUppercase) => updateLayout({ header: { isUppercase } })} />
              {!card && (
                <>
                  <ColorPicker label="Warna teks" color={h.color} onChange={(color) => updateLayout({ header: { color } })} />
                  <ToggleSwitch label="Kotak di belakang teks" checked={!!h.boxColor} onChange={(on) => updateLayout({ header: { boxColor: on ? '#000000B3' : '' } })} />
                  {h.boxColor && <ColorPicker label="Warna kotak" color={h.boxColor} onChange={(boxColor) => updateLayout({ header: { boxColor } })} />}
                  <Slider label="Jarak ke video" min={LAYOUT_LIMITS.headerGap.min} max={LAYOUT_LIMITS.headerGap.max} value={h.gap} format={px} onChange={(gap) => updateLayout({ header: { gap } })} />
                </>
              )}
              {card && <p className="mc-caption mc-muted">Warna teks postingan diatur di tab Kartu.</p>}
              {covered.length > 0 && (
                <Alert tone="warning" title="Judul bisa tertutup">
                  Bagian atas judul contoh masuk area menu {platformNames(covered)}. Turunkan bingkai video atau kecilkan judul.
                </Alert>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'credit' && (
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

      <Divider />

      <div className="mc-stack">
        <ToggleSwitch
          label="Zoom dinamis"
          hint="Video membesar sebentar untuk memberi penekanan. Berlaku di semua tampilan."
          checked={z.enabled}
          onChange={(enabled) => updateLayout({ zoom: { enabled } })}
        />
        {z.enabled && (
          <>
            <Field
              label="Kapan zoom"
              hint={
                z.style === 'keywords'
                  ? 'Zoom halus setiap kata kunci yang ditandai AI, lalu kembali.'
                  : 'Bergantian: satu kalimat normal, kalimat berikutnya lebih dekat.'
              }
            >
              <ChoiceChips<ZoomStyle> ariaLabel="Kapan zoom" size="sm" options={ZOOM_STYLE_OPTIONS} value={z.style} onChange={(style) => updateLayout({ zoom: { style } })} />
            </Field>
            <Slider
              label="Besar zoom"
              min={LAYOUT_LIMITS.zoomAmount.min}
              max={LAYOUT_LIMITS.zoomAmount.max}
              step={0.01}
              value={z.amount}
              format={(v) => `${Math.round((1 + v) * 100)}%`}
              onChange={(amount) => updateLayout({ zoom: { amount } })}
            />
            {z.style === 'keywords' && !keywordsOn && (
              <Alert tone="info" title="Kata kunci AI sedang mati">
                Zoom ini mengikuti kata kunci dari AI subtitle. Nyalakan &quot;Sorot kata kunci (AI)&quot; di bagian AI subtitle, atau pilih &quot;Tiap kalimat&quot;.
              </Alert>
            )}
          </>
        )}
      </div>

      <Divider />

      <div className="mc-stack">
        <ToggleSwitch
          label="Nama pembicara"
          hint="Label nama dan keterangan muncul beberapa detik di awal klip. Nama diisi per klip di editor, dan bisa diusulkan AI."
          checked={sp.enabled}
          onChange={(enabled) => updateLayout({ speaker: { enabled } })}
        />
        {sp.enabled && (
          <>
            <div className="mc-row mc-row--top mc-gap-16">
              <InputField
                label="Nama bawaan"
                containerClassName="mc-grow"
                value={sp.name}
                maxLength={60}
                placeholder="Kosongkan bila beda tiap klip"
                hint="Dipakai bila klip tidak mengisi nama sendiri."
                onChange={(e) => updateLayout({ speaker: { name: e.target.value } })}
              />
              <InputField
                label="Keterangan bawaan"
                containerClassName="mc-grow"
                value={sp.role}
                maxLength={60}
                placeholder="Misal: Host"
                onChange={(e) => updateLayout({ speaker: { role: e.target.value } })}
              />
            </div>
            <div className="mc-row mc-row--top mc-gap-16">
              <SelectField
                label="Font"
                containerClassName="mc-grow"
                value={sp.fontFamily}
                options={SUPPORTED_FONTS.map((f) => ({ value: f, label: f }))}
                onChange={(e) => updateLayout({ speaker: { fontFamily: e.target.value } })}
              />
              <Field label="Posisi" style={{ flexShrink: 0 }}>
                <ChoiceChips<SpeakerAlign> ariaLabel="Posisi label nama" size="sm" options={SPEAKER_ALIGN_OPTIONS} value={sp.align} onChange={(align) => updateLayout({ speaker: { align } })} />
              </Field>
            </div>
            <Slider label="Ukuran" min={LAYOUT_LIMITS.speakerSize.min} max={LAYOUT_LIMITS.speakerSize.max} value={sp.fontSize} format={px} onChange={(fontSize) => updateLayout({ speaker: { fontSize } })} />
            <Slider
              label="Posisi vertikal"
              min={LAYOUT_LIMITS.speakerY.min}
              max={LAYOUT_LIMITS.speakerY.max}
              value={sp.y}
              format={px}
              hint="Jarak label dari atas. Bawaannya tepat di atas caption."
              onChange={(y) => updateLayout({ speaker: { y } })}
            />
            <Slider label="Muncul pada" min={LAYOUT_LIMITS.speakerStart.min} max={10} step={0.1} value={sp.start} format={secs} onChange={(start) => updateLayout({ speaker: { start } })} />
            <Slider label="Lama tampil" min={LAYOUT_LIMITS.speakerDuration.min} max={15} step={0.5} value={sp.duration} format={secs} onChange={(duration) => updateLayout({ speaker: { duration } })} />
            <ColorPicker label="Kotak nama" color={sp.color} onChange={(color) => updateLayout({ speaker: { color } })} />
            <ColorPicker label="Teks nama" color={sp.textColor} onChange={(textColor) => updateLayout({ speaker: { textColor } })} />
            <ColorPicker label="Kotak keterangan" color={sp.accent} onChange={(accent) => updateLayout({ speaker: { accent } })} />
            <ColorPicker label="Teks keterangan" color={sp.accentText} onChange={(accentText) => updateLayout({ speaker: { accentText } })} />
          </>
        )}
      </div>

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
