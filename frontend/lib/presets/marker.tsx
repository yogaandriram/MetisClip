import React from 'react';
import { SubtitlePreset } from './types';

export const markerPreset: SubtitlePreset = {
  id: 'marker',
  name: 'MARKER',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Permanent Marker',
    fontWeight: 'Regular',
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: false,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#FACC15'
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        padding: '20px',
        borderRadius: '12px',
        background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
        border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-glass)'}`,
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '80px',
        fontFamily: 'Permanent Marker, sans-serif',
        fontSize: '18px',
        fontWeight: 'Regular',
        textTransform: "uppercase"
      }}
    >
      MARKER
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ color: '#000', background: config.highlightColor, padding: '4px 14px', transform: 'rotate(-3deg)', display: 'inline-block' }}>
        {words[activeWordIndex].word}
      </span>
  )
};
