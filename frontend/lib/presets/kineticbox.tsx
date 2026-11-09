import React from 'react';
import { SubtitlePreset } from './types';
import { cubicBezier, interpolate, r4 } from './anim';
import { dropShadow, highlight, keywordColor, rowStyle, shadows, stroke, textBase } from './style';
import { growRoom } from './metrics';

export const kineticboxPreset: SubtitlePreset = {
  id: 'kineticbox',
  name: 'KINETIC BOX',
  wordsPerPage: 3,
  // Condensed bold, so the moving box fits more words per line
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Oswald',
    fontSize: 38,
    fontWeight: 'Bold',
    isItalic: false,
    isUnderline: false,
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 4,
    highlightColor: baseHighlightColor || '#FFD700',
    letterSpacing: 0.5,
    lineHeight: 1.15,
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#FFFF00';
    return (
      <button
        onClick={onClick}
        style={{
          padding: '20px',
          borderRadius: '12px',
          background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-glass)'}`,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80px',
          fontFamily: "'Oswald', var(--font-display)",
          fontSize: '24px',
          fontWeight: '700',
          textTransform: "uppercase",
          boxShadow: isSelected ? '0 0 20px rgba(24, 86, 255, 0.3)' : 'none',
          overflow: 'hidden'
        }}
      >
        <span style={{ 
          background: activeColor,
          color: '#111',
          padding: '4px 12px',
          transform: 'skewX(-10deg) scale(1.05)',
          display: 'inline-block',
          boxShadow: '4px 4px 0 rgba(0,0,0,0.8)'
        }}>
          <span style={{ display: 'inline-block', transform: 'skewX(10deg)' }}>KINETIC</span>
        </span>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const fontColor = config.fontColor || '#ffffff';
    const activeColor = highlight(config, '#FFEB3B');
    const kwColor = keywordColor(config, fontColor, '#FFEB3B');
    const base = textBase(config);
    const restShadow = shadows(stroke(config), dropShadow(config) || '0.055em 0.055em 0.111em rgba(0,0,0,0.8)');
    const smash = cubicBezier(0.25, 1, 0.5, 1);

    return (
      <span style={rowStyle(0.08)}>
        {words.map((w, i) => {
          const key = `${i}-${w.start}`;
          // Every word keeps the box padding, so the line does not jump when the box moves on.
          const box: React.CSSProperties = { ...base, display: 'inline-block', padding: '0.111em 0.333em', marginInline: growRoom(w.word, w.keyword ? 1.12 : 1.05, config) };
          if (i === activeWordIndex) {
            // kineticSmash 0.3s cubic-bezier(0.25, 1, 0.5, 1): 0% → 60% → 100%
            const t = time - w.start;
            const peak = w.keyword ? 1.25 : 1.15;
            const scale = interpolate(t, [0, 0.18, 0.3], [0.5, peak, w.keyword ? 1.12 : 1.05], smash);
            const opacity = interpolate(t, [0, 0.18], [0, 1], smash);
            const sh = interpolate(t, [0, 0.18, 0.3], [0, 0.222, 0.111], smash);
            return (
              <span
                key={key}
                style={{
                  ...box,
                  background: activeColor,
                  color: '#111111',
                  textShadow: 'none',
                  opacity: r4(opacity),
                  transform: `skewX(-10deg) scale(${r4(scale)})`,
                  boxShadow: `${r4(sh)}em ${r4(sh)}em 0 rgba(0,0,0,0.8)`,
                }}
              >
                <span style={{ display: 'inline-block', transform: 'skewX(10deg)' }}>{w.word}</span>
              </span>
            );
          }
          return (
            <span
              key={key}
              style={{ ...box, color: w.keyword ? kwColor : fontColor, opacity: 0.9, transform: 'scale(0.95)', textShadow: restShadow }}
            >
              {w.word}
            </span>
          );
        })}
      </span>
    );
  },
};
