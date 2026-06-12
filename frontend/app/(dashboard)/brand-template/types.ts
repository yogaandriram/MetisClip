export interface LayoutSettings {
  aspect: string;
  fit: string;
  safeZone?: 'none' | 'tiktok' | 'reels' | 'shorts';
}

export interface CaptionSettings {
  mode: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontColor: string;
  isItalic: boolean;
  isUnderline: boolean;
  isUppercase: boolean;
  strokeColor: string;
  strokeWidth: number;
  hasShadow: boolean;
  shadowColor: string;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  highlightColor: string;
  positionY: number;
}

export interface AiSettings {
  fillerWords: boolean;
  pauses: boolean;
  keywords: boolean;
  emojis: boolean;
}

export interface BrandSettings {
  overlayUrl?: string;
  introUrl?: string;
  musicUrl?: string;
  sampleVideoUrl?: string;
  logoPosition?: { x: number, y: number };
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
    aspect: '9:16',
    fit: 'Fit',
    safeZone: 'none'
  },
  caption_settings: {
    mode: 'auto',
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 'Bold',
    fontColor: '#FFFFFF',
    isItalic: false,
    isUnderline: false,
    isUppercase: false,
    strokeColor: '#000000',
    strokeWidth: 2,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 4,
    highlightColor: '#FFFF00',
    positionY: 80
  },
  ai_settings: {
    fillerWords: true,
    pauses: true,
    keywords: true,
    emojis: false
  },
  brand_settings: {
    overlayUrl: '',
    introUrl: '',
    musicUrl: '',
    sampleVideoUrl: ''
  }
};
