import React from 'react';
import { SubtitlePreset } from './types';

export const impactfulPreset: SubtitlePreset = {
  id: 'impactful',
  name: 'IMPACTFUL',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Oswald',
    fontWeight: 'Bold',
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 4,
    shadowY: 4,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#EF4444'
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
        fontFamily: 'Oswald, sans-serif',
        fontSize: '18px',
        fontWeight: 'Bold',
        textTransform: "uppercase"
      }}
    >
      IMPACTFUL
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ color: '#fff', background: config.highlightColor, padding: '4px 12px', textTransform: 'uppercase' }}>
        {words[activeWordIndex].word}
      </span>
  )
};
