import React, { useId, useState } from 'react';
import { Check, ChevronDown, RotateCcw } from 'lucide-react';
import { Button, ColorPicker, Divider, Dropdown, Field, InputField, SelectField, Slider, Tabs, ToggleSwitch } from '@/components/ui';
import { presets } from '@/lib/presets';
import { CaptionSettings } from '../types';
import { SUPPORTED_FONTS, FONT_WEIGHTS_MAP } from '@/lib/constants';

interface CaptionSettingsPanelProps {
  caption: CaptionSettings;
  updateCaption: (updates: Partial<CaptionSettings>, replace?: boolean) => void;
}

const px = (v: number) => `${v}px`;

/** Preset names are stored upper case ("POP SHADOW"); the UI shows them in sentence case. */
export function presetLabel(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className="mc-stack">
      <Divider />
      <button
        type="button"
        className="mc-btn mc-btn--ghost mc-btn--sm mc-btn--block"
        style={{ justifyContent: 'space-between', paddingLeft: 'var(--s-3)', paddingRight: 'var(--s-3)' }}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setIsOpen(!isOpen)}
      >
        {title}
        <ChevronDown
          size={16}
          aria-hidden="true"
          style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-base) var(--ease-out)' }}
        />
      </button>
      <div id={bodyId} className="mc-stack" hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
};

export const CaptionSettingsPanel: React.FC<CaptionSettingsPanelProps> = ({ caption, updateCaption }) => {
  const [captionTab, setCaptionTab] = useState('presets');

  const handlePresetSelect = (presetId: string) => {
    // Picking a preset (or "reset") drops the font overrides, so the preset's own default font
    // settings apply; position and sync offset are kept.
    updateCaption({ mode: presetId, positionY: caption.positionY, offsetTime: caption.offsetTime }, true);
  };

  const weights = FONT_WEIGHTS_MAP[caption.fontFamily || 'Montserrat'] || ['Regular'];
  // A preset may set a weight the font list does not name; keep it selectable so the select shows it
  const weightOptions = weights.includes(caption.fontWeight) ? weights : [caption.fontWeight, ...weights];

  return (
    <div className="mc-stack mc-gap-20">
      <Tabs
        tabs={[
          { id: 'presets', label: 'Preset' },
          { id: 'font', label: 'Font' }
        ]}
        activeTab={captionTab}
        onChange={setCaptionTab}
        ariaLabel="Pengaturan caption"
        size="sm"
        block
      />

      {captionTab === 'presets' && (
        <div className="mc-stack">
          <p className="mc-caption mc-muted">
            Setiap preset punya font bawaan sendiri. Memilih preset mengganti pengaturan di tab Font ke bawaannya.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--s-4)' }}>
            {presets.map(p => {
              const isSelected = caption.mode === p.id;
              return (
                <div key={p.id} className="mc-stack mc-gap-8">
                  {/* The preset button is a preview of the video caption, so it sits on an ink thumbnail */}
                  <div
                    className="mc-thumb"
                    style={{
                      display: 'grid',
                      boxShadow: isSelected ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : undefined,
                    }}
                  >
                    {p.renderButton(isSelected, () => handlePresetSelect(p.id))}
                  </div>
                  <span className={isSelected ? 'mc-row mc-gap-4 mc-caption' : 'mc-row mc-gap-4 mc-caption mc-muted'}>
                    {isSelected && <Check size={14} aria-hidden="true" />}
                    {presetLabel(p.name)}
                    {isSelected && <span className="mc-sr-only">(dipilih)</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {captionTab === 'font' && (
        <div className="mc-stack mc-gap-20">
          <div className="mc-row mc-row--between">
            <p className="mc-label">Pengaturan font</p>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={16} aria-hidden="true" />}
              onClick={() => handlePresetSelect(caption.mode)}
              title="Kembalikan ke font bawaan preset"
            >
              Bawaan preset
            </Button>
          </div>

          <Field label="Jenis font">
            <div style={{ display: 'grid' }}>
              <Dropdown
                width="100%"
                triggerLabel={`Jenis font: ${caption.fontFamily}`}
                triggerClassName="mc-input mc-row mc-row--between"
                trigger={
                  <>
                    <span className="mc-truncate">{caption.fontFamily}</span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </>
                }
                items={SUPPORTED_FONTS.map(f => ({
                  id: f,
                  label: <span style={{ fontFamily: f, fontSize: '15px' }}>{f}</span>,
                  selected: f === caption.fontFamily,
                  onClick: () => {
                    const availableWeights = FONT_WEIGHTS_MAP[f] || ['Regular'];
                    let safeWeight = caption.fontWeight;
                    if (!availableWeights.includes(safeWeight || 'Regular')) {
                      safeWeight = availableWeights.includes('Regular') ? 'Regular' : availableWeights[0];
                    }
                    updateCaption({ fontFamily: f, fontWeight: safeWeight });
                  }
                }))}
              />
            </div>
          </Field>

          <div className="mc-row mc-row--top mc-gap-16">
            <SelectField
              label="Ketebalan"
              containerClassName="mc-grow"
              value={caption.fontWeight}
              options={weightOptions.map(w => ({ value: w, label: w }))}
              onChange={(e) => updateCaption({ fontWeight: e.target.value })}
            />
            <InputField
              label="Ukuran (px)"
              type="number"
              min={10}
              max={300}
              mono
              containerStyle={{ width: 120, flexShrink: 0 }}
              value={caption.fontSize}
              onChange={(e) => updateCaption({ fontSize: Number(e.target.value) })}
            />
          </div>

          <div className="mc-stack mc-gap-12">
            <ColorPicker label="Warna teks" color={caption.fontColor} onChange={(c) => updateCaption({ fontColor: c })} />
            <ColorPicker label="Highlight (aktif)" color={caption.highlightColor} onChange={(c) => updateCaption({ highlightColor: c })} />
          </div>

          <CollapsibleSection title="Posisi & jarak">
            <Slider
              label="Posisi vertikal"
              min={0}
              max={400}
              value={caption.positionY || 80}
              format={px}
              onChange={(val) => updateCaption({ positionY: val })}
            />
            <Slider
              label="Jarak antar-huruf"
              min={-5}
              max={20}
              value={caption.letterSpacing ?? 0}
              format={px}
              onChange={(val) => updateCaption({ letterSpacing: val })}
            />
            <Slider
              label="Jarak antar-baris"
              min={0.5}
              max={3.0}
              step={0.1}
              value={caption.lineHeight ?? 1.2}
              onChange={(val) => updateCaption({ lineHeight: val })}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Garis luar & bayangan">
            <ColorPicker label="Warna garis luar" color={caption.strokeColor} onChange={(c) => updateCaption({ strokeColor: c })} />
            <Slider
              label="Tebal garis luar"
              min={0}
              max={50}
              value={caption.strokeWidth}
              format={px}
              onChange={(val) => updateCaption({ strokeWidth: val })}
            />
            <ToggleSwitch label="Bayangan" checked={caption.hasShadow} onChange={(v) => updateCaption({ hasShadow: v })} />
            {caption.hasShadow && (
              <>
                <ColorPicker label="Warna bayangan" color={caption.shadowColor} onChange={(c) => updateCaption({ shadowColor: c })} />
                <Slider label="Geser X" min={-100} max={100} value={caption.shadowX} format={px} onChange={(val) => updateCaption({ shadowX: val })} />
                <Slider label="Geser Y" min={-100} max={100} value={caption.shadowY} format={px} onChange={(val) => updateCaption({ shadowY: val })} />
                <Slider label="Blur" min={0} max={100} value={caption.shadowBlur} format={px} onChange={(val) => updateCaption({ shadowBlur: val })} />
              </>
            )}
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
};
