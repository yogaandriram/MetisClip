import React from 'react';
import { SubtitlePreset } from './types';

export const vaporwavePreset: SubtitlePreset = {
  id: 'vaporwave',
  name: 'vaporwave',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Courier New',
    fontWeight: 'Bold',
    isUppercase: false,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#FF00FF',
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#00FFFF'
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
        fontFamily: 'Courier New, sans-serif',
        fontSize: '18px',
        fontWeight: 'Bold',
        textTransform: "none"
      }}
    >
      vaporwave
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ color: config.fontColor }}>{words[activeWordIndex - 1]?.word}</span>
        <span style={{ color: config.highlightColor, textShadow: '0 0 10px #FF00FF' }}>{words[activeWordIndex].word}</span>
        <span style={{ color: config.fontColor }}>{words[activeWordIndex + 1]?.word}</span>
      </span>
  )
};
