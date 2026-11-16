import type { CaptionStyle } from '@/lib/presets/defaults';
import { resolveCaptionStyle } from '@/lib/presets/defaults';
import { type AiCaptionSettings, DEFAULT_AI_SETTINGS } from '@/lib/presets/captions';
import { DEFAULT_LAYOUT, type Layout } from '@/lib/presets/layout';
import type { Messages } from '@/lib/i18n';

/** 'all' = the area any of TikTok, IG Reels and YT Shorts covers (lib/presets/position.ts). */
export type SafeZone = 'none' | 'all' | 'tiktok' | 'reels' | 'shorts';

/** How the video sits on the canvas (lib/presets/layout.ts), plus the preview-only safe-zone guide. */
export interface LayoutSettings extends Layout {
  /** Platform UI guide drawn on the preview only (never rendered into the clip). */
  safeZone?: SafeZone;
}

export function safeZoneOptions(t: Messages): { value: SafeZone; label: string }[] {
  return [
    { value: 'all', label: t.brand.layout.safeZone.all },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'reels', label: 'IG Reels' },
    { value: 'shorts', label: 'YT Shorts' },
    { value: 'none', label: t.common.none },
  ];
}

export function safeZoneLabel(zone: SafeZone | undefined, t: Messages): string {
  return safeZoneOptions(t).find((o) => o.value === (zone || 'none'))?.label || '';
}

/** Same model as the clip editor and the render (lib/presets/defaults.ts). */
export type CaptionSettings = CaptionStyle;

/** Applied when clips are processed and rendered; each clip can override them in the editor. */
export type AiSettings = AiCaptionSettings;

export interface BrandSettings {
  overlayUrl?: string;
  sampleVideoUrl?: string;
  logoPosition?: { x: number, y: number };
  logoScale?: number;
}

export interface TemplateConfig {
  id?: string;
  name?: string;
  agent_id?: string;
  user_id?: string;
  layout_settings: LayoutSettings;
  caption_settings: CaptionSettings;
  ai_settings: AiSettings;
  brand_settings: BrandSettings;
}

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  layout_settings: {
    ...DEFAULT_LAYOUT,
    safeZone: 'all'
  },
  caption_settings: resolveCaptionStyle({ mode: 'popshadow' }),
  ai_settings: { ...DEFAULT_AI_SETTINGS },
  brand_settings: {
    overlayUrl: '',
    sampleVideoUrl: ''
  }
};
