import React from 'react';
import { SubtitlePreset } from './types';

export const boldboxPreset: SubtitlePreset = {
  id: 'boldbox',
  name: 'BOLDBOX',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Anton',
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
        fontFamily: 'Anton, sans-serif',
        fontSize: '18px',
        fontWeight: 'Regular',
        textTransform: "uppercase"
      }}
    >
      BOLDBOX
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ color: '#000', background: config.highlightColor, padding: '4px 12px', borderRadius: '4px', textTransform: 'uppercase' }}>
        {words[activeWordIndex].word}
      </span>
  )
};
