import type { CaptionStyle } from '@/lib/presets/defaults';
import { resolveCaptionStyle } from '@/lib/presets/defaults';
import { type AiCaptionSettings, DEFAULT_AI_SETTINGS } from '@/lib/presets/captions';

export type SafeZone = 'none' | 'tiktok' | 'reels' | 'shorts';

export interface LayoutSettings {
  /** Platform UI guide drawn on the preview only (never rendered into the clip). */
  safeZone?: SafeZone;
}

export const SAFE_ZONE_OPTIONS: { value: SafeZone; label: string }[] = [
  { value: 'none', label: 'Tidak ada' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'reels', label: 'IG Reels' },
  { value: 'shorts', label: 'YT Shorts' },
];

export function safeZoneLabel(zone: SafeZone | undefined): string {
  return SAFE_ZONE_OPTIONS.find((o) => o.value === (zone || 'none'))?.label || '';
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
    safeZone: 'tiktok'
  },
  caption_settings: resolveCaptionStyle({ mode: 'popshadow' }),
  ai_settings: { ...DEFAULT_AI_SETTINGS },
  brand_settings: {
    overlayUrl: '',
    sampleVideoUrl: ''
  }
};
