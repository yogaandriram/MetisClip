import React from 'react';
import { SubtitlePreset } from './types';

export const retroPreset: SubtitlePreset = {
  id: 'retro',
  name: 'retro',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Pacifico',
    fontWeight: 'Regular',
    isUppercase: false,
    fontColor: '#FFFFFF',
    strokeColor: '#FF00FF',
    strokeWidth: 2,
    hasShadow: true,
    shadowColor: '#00FFFF',
    shadowX: 4,
    shadowY: 4,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#FFFF00'
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
        fontFamily: 'Pacifico, sans-serif',
        fontSize: '18px',
        fontWeight: 'Regular',
        textTransform: "none"
      }}
    >
      retro
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ color: config.fontColor }}>{words[activeWordIndex - 1]?.word}</span>
        <span style={{ color: config.highlightColor, textShadow: `0 0 10px ${config.highlightColor}, 0 0 20px ${config.highlightColor}` }}>{words[activeWordIndex].word}</span>
        <span style={{ color: config.fontColor }}>{words[activeWordIndex + 1]?.word}</span>
      </span>
  )
};
