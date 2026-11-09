import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, interpolate, r4 } from './anim';
import { dropShadow, em, highlight, keywordColor, rowStyle, shadows, stroke, textBase } from './style';

export const luminaPreset: SubtitlePreset = {
  id: 'lumina',
  name: 'LUMINA',
  wordsPerPage: 3,
  // Soft and elegant: mixed case, medium weight, glass pill
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 32,
    fontWeight: 'Semi-Bold',
    isItalic: false,
    isUnderline: false,
    isUppercase: false,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 2,
    shadowBlur: 6,
    highlightColor: baseHighlightColor || '#00FFCC',
    letterSpacing: 0,
    lineHeight: 1.2,
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#FFFFFF';
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
          fontFamily: "'Plus Jakarta Sans', var(--font-display)",
          fontSize: '18px',
          fontWeight: '600',
          textTransform: "uppercase",
          boxShadow: isSelected ? '0 0 20px rgba(24, 86, 255, 0.3)' : 'none',
          overflow: 'hidden'
        }}
      >
        <span style={{ 
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '50px',
          padding: '6px 16px',
          color: activeColor,
          letterSpacing: '4px',
          textShadow: `0 0 10px ${activeColor}`,
          display: 'inline-block',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        }}>
          LUMINA
        </span>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const fontColor = config.fontColor || '#ffffff';
    const activeColor = highlight(config, '#FFFFFF');
    const kwColor = keywordColor(config, fontColor, '#00FFCC');
    const base = textBase(config);
    const spacing = em(config.letterSpacing, config);
    const restShadow = shadows(stroke(config), dropShadow(config));

    return (
      <span style={rowStyle(0.05)}>
        {words.map((w, i) => {
          const key = `${i}-${w.start}`;
          // Same padding/border on every word: only the pill appears, the line does not shift.
          const pill: React.CSSProperties = {
            ...base,
            display: 'inline-block',
            padding: '0.17em 0.5em',
            border: '0.03em solid transparent',
            borderRadius: '1.4em',
          };
          if (i === activeWordIndex) {
            // etherealFade 0.8s ease-out
            const t = time - w.start;
            const opacity = interpolate(t, [0, 0.8], [0, 1], Ease.easeOut);
            const ty = interpolate(t, [0, 0.8], [0.28, 0], Ease.easeOut);
            const scale = interpolate(t, [0, 0.8], [0.9, w.keyword ? 1.08 : 1], Ease.easeOut);
            const extra = interpolate(t, [0, 0.8], [0, 0.08], Ease.easeOut);
            const blur = interpolate(t, [0, 0.8], [0.11, 0], Ease.easeOut);
            return (
              <span
                key={key}
                style={{
                  ...pill,
                  background: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(0.28em)',
                  WebkitBackdropFilter: 'blur(0.28em)',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  color: activeColor,
                  letterSpacing: `${r4(spacing + extra)}em`,
                  textShadow: shadows(stroke(config), `0 0 0.28em ${activeColor}`, '0 0.055em 0.11em rgba(0,0,0,0.5)'),
                  boxShadow: '0 0.11em 0.42em rgba(0,0,0,0.2)',
                  opacity: r4(opacity),
                  transform: `translateY(${r4(ty)}em) scale(${r4(scale)})`,
                  filter: blur > 0.0005 ? `blur(${r4(blur)}em)` : 'none',
                }}
              >
                {w.word}
              </span>
            );
          }
          return (
            <span
              key={key}
              style={{
                ...pill,
                color: w.keyword ? kwColor : fontColor,
                opacity: w.keyword ? 0.75 : 0.4,
                transform: 'scale(0.95)',
                filter: 'blur(0.03em)',
                textShadow: restShadow,
              }}
            >
              {w.word}
            </span>
          );
        })}
      </span>
    );
  },
};
