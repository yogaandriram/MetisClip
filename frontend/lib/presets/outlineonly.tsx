import React from 'react';
import { SubtitlePreset } from './types';

export const outlineonlyPreset: SubtitlePreset = {
  id: 'outlineonly',
  name: 'OUTLINEONLY',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Arial Black',
    fontWeight: 'Black',
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#FFFFFF',
    strokeWidth: 2,
    hasShadow: false,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#3B82F6'
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
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '18px',
        fontWeight: 'Black',
        textTransform: "uppercase"
      }}
    >
      OUTLINEONLY
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ color: 'transparent', WebkitTextStroke: `2px ${config.fontColor}` }}>{words[activeWordIndex - 1]?.word}</span>
        <span style={{ color: config.highlightColor, WebkitTextStroke: '2px transparent', display: 'inline-block' }}>{words[activeWordIndex].word}</span>
        <span style={{ color: 'transparent', WebkitTextStroke: `2px ${config.fontColor}` }}>{words[activeWordIndex + 1]?.word}</span>
      </span>
  )
};
