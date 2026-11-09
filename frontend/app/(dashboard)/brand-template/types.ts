import type { CaptionStyle } from '@/lib/presets/defaults';
import { resolveCaptionStyle } from '@/lib/presets/defaults';
import { type AiCaptionSettings, DEFAULT_AI_SETTINGS } from '@/lib/presets/captions';

export interface LayoutSettings {
  /** Platform UI guide drawn on the preview only (never rendered into the clip). */
  safeZone?: 'none' | 'tiktok' | 'reels' | 'shorts';
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
