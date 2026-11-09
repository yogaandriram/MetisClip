// One caption style model for the editor, the Brand Template page and the Remotion render.
// Effective style = BASE_CAPTION_STYLE ⊕ preset defaults ⊕ (brand caption_settings ⊕ clip subtitle_style).
import type { PresetConfig, SubtitlePreset } from './types';
import { presets } from './index';

export interface CaptionStyle extends PresetConfig {
  mode: string;
  /** Distance of the caption's bottom edge from the bottom of a 300×533 canvas (design px). */
  positionY: number;
  /** Caption sync offset in milliseconds (positive = captions later). */
  offsetTime: number;
}

export const BASE_CAPTION_STYLE: CaptionStyle = {
  mode: 'popshadow',
  fontFamily: 'Montserrat',
  fontSize: 36,
  fontWeight: 'Bold',
  fontColor: '#FFFFFF',
  isItalic: false,
  isUnderline: false,
  isUppercase: false,
  strokeColor: '#000000',
  strokeWidth: 0,
  hasShadow: false,
  shadowColor: '#000000',
  shadowX: 0,
  shadowY: 0,
  shadowBlur: 0,
  highlightColor: '#07CA6B',
  letterSpacing: 0,
  lineHeight: 1.2,
  positionY: 80,
  offsetTime: 0,
};

/** Canvas the design px refer to (the Brand Template preview size). */
export const DESIGN_CANVAS = { width: 300, height: 533 };

// Older clips stored some keys in snake_case
const LEGACY_KEYS: Record<string, keyof CaptionStyle> = {
  font_family: 'fontFamily',
  font_size: 'fontSize',
  font_weight: 'fontWeight',
  font_color: 'fontColor',
  is_italic: 'isItalic',
  is_underline: 'isUnderline',
  is_uppercase: 'isUppercase',
  stroke_color: 'strokeColor',
  stroke_width: 'strokeWidth',
  has_shadow: 'hasShadow',
  shadow_color: 'shadowColor',
  shadow_x: 'shadowX',
  shadow_y: 'shadowY',
  shadow_blur: 'shadowBlur',
  highlight_color: 'highlightColor',
  letter_spacing: 'letterSpacing',
  line_height: 'lineHeight',
  position_y: 'positionY',
  offset_time: 'offsetTime',
};

const NUMERIC: (keyof CaptionStyle)[] = ['fontSize', 'strokeWidth', 'shadowX', 'shadowY', 'shadowBlur', 'letterSpacing', 'lineHeight', 'positionY', 'offsetTime'];
const BOOLEAN: (keyof CaptionStyle)[] = ['isItalic', 'isUnderline', 'isUppercase', 'hasShadow'];

/** Only known caption keys, camelCase, with sane types. Unknown keys (e.g. `ai`) are dropped. */
export function normalizeCaptionStyle(raw: Record<string, any> | null | undefined): Partial<CaptionStyle> {
  const out: Record<string, any> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    const camel = LEGACY_KEYS[k];
    if (camel) {
      if (raw[camel] === undefined || raw[camel] === null) out[camel] = v;
    } else if (k in BASE_CAPTION_STYLE) {
      out[k] = v;
    }
  }
  for (const k of NUMERIC) {
    if (k in out) {
      const n = Number(out[k]);
      if (Number.isFinite(n)) out[k] = n;
      else delete out[k];
    }
  }
  for (const k of BOOLEAN) if (k in out) out[k] = !!out[k];
  if (out.fontSize !== undefined) out.fontSize = Math.min(300, Math.max(6, out.fontSize));
  return out as Partial<CaptionStyle>;
}

export function getPreset(mode: string | undefined): SubtitlePreset {
  return presets.find((p) => p.id === mode) || presets.find((p) => p.id === 'popshadow') || presets[0];
}

/** Full style used for display: base ⊕ preset defaults ⊕ the stored (effective) style. */
export function resolveCaptionStyle(effective: Record<string, any> | null | undefined): CaptionStyle {
  const normalized = normalizeCaptionStyle(effective);
  const preset = getPreset(normalized.mode);
  return { ...BASE_CAPTION_STYLE, ...(preset.getDefaultConfig() as Partial<CaptionStyle>), ...normalized, mode: preset.id };
}

/** Defaults applied when the user picks another preset (keeps position and sync offset). */
export function presetSwitch(style: CaptionStyle, mode: string): CaptionStyle {
  const preset = getPreset(mode);
  return { ...BASE_CAPTION_STYLE, ...(preset.getDefaultConfig() as Partial<CaptionStyle>), mode: preset.id, positionY: style.positionY, offsetTime: style.offsetTime };
}
