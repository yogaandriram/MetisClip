import type { CaptionStyle } from '@/lib/presets/defaults';
import { resolveCaptionStyle } from '@/lib/presets/defaults';
import { type AiCaptionSettings, DEFAULT_AI_SETTINGS } from '@/lib/presets/captions';
import { DEFAULT_LAYOUT, type Layout } from '@/lib/presets/layout';

/** 'all' = the area any of TikTok, IG Reels and YT Shorts covers (lib/presets/position.ts). */
export type SafeZone = 'none' | 'all' | 'tiktok' | 'reels' | 'shorts';

/** How the video sits on the canvas (lib/presets/layout.ts), plus the preview-only safe-zone guide. */
export interface LayoutSettings extends Layout {
  /** Platform UI guide drawn on the preview only (never rendered into the clip). */
  safeZone?: SafeZone;
}

export const SAFE_ZONE_OPTIONS: { value: SafeZone; label: string }[] = [
  { value: 'all', label: 'Semua platform' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'reels', label: 'IG Reels' },
  { value: 'shorts', label: 'YT Shorts' },
  { value: 'none', label: 'Tidak ada' },
];

/** Sample title for the Brand Template previews (clips use their own hook text). */
export const SAMPLE_TITLE = 'Rahasia konten viral yang jarang orang tahu';

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
