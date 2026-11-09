import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, cycle, interpolate, lerp, r4 } from './anim';
import { em, growRoom, highlight, keywordColor, rowStyle, shadows, sinceNext, stroke, textBase, withAlpha } from './style';

export const neonpulsePreset: SubtitlePreset = {
  id: 'neonpulse',
  name: 'NEON PULSE',
  wordsPerPage: 3,
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Orbitron',
    fontSize: 36,
    fontWeight: 'Regular',
    isUppercase: true,
    fontColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#FF00FF',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 10,
    highlightColor: baseHighlightColor || '#FF00FF',
    letterSpacing: 0,
    lineHeight: 1.2
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#FF00FF';
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
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '24px',
          fontWeight: '900',
          boxShadow: isSelected ? `0 0 20px rgba(255, 0, 255, 0.2)` : 'none',
          overflow: 'hidden',
          letterSpacing: '2px',
          textTransform: 'uppercase'
        }}
      >
        <style>
          {`
            @keyframes neonBtnPulse {
              0%, 100% {
                text-shadow: 0 0 5px ${activeColor}, 0 0 15px ${activeColor};
              }
              50% {
                text-shadow: 0 0 2px ${activeColor}, 0 0 5px ${activeColor};
              }
            }
            .neon-btn-text {
              color: ${activeColor};
              animation: neonBtnPulse 1.5s ease-in-out infinite;
              display: inline-block;
            }
          `}
        </style>
        <span className="neon-btn-text">
          NEON PULSE
        </span>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const fontColor = config.fontColor || '#ffffff';
    const activeColor = highlight(config, '#FF00FF');
    const kwColor = keywordColor(config, fontColor, '#FF00FF');
    const base = textBase(config);
    const outline = stroke(config);
    const restGlow = config.hasShadow ? em(config.shadowBlur || 0, config) : 0;
    const restColor = config.shadowColor || '#000000';

    return (
      <span style={{ ...rowStyle(0.3), padding: '0.55em' }}>
        {words.map((w, i) => {
          const key = `${i}-${w.start}`;
          if (i === activeWordIndex) {
            const t = time - w.start;
            // Grows in over 0.3 s, then neonPulseAnim 1.5s ease-in-out infinite
            const scale = interpolate(t, [0, 0.3], [0.9, w.keyword ? 1.2 : 1.15], Ease.ease);
            const c = cycle(t, 1.5);
            const s = c < 0.5 ? Ease.easeInOut(c / 0.5) : 1 - Ease.easeInOut((c - 0.5) / 0.5);
            const glowColor = w.keyword ? kwColor : activeColor;
            const glow = [
              `0 0 ${r4(lerp(0.139, 0.056, s))}em ${glowColor}`,
              `0 0 ${r4(lerp(0.556, 0.222, s))}em ${glowColor}`,
              `0 0 ${r4(lerp(1.111, 0.222, s))}em ${withAlpha(glowColor, r4(1 - s))}`,
            ];
            return (
              <span
                key={key}
                style={{ ...base, display: 'inline-block', marginInline: growRoom(w.word, w.keyword ? 1.2 : 1.15, config), position: 'relative', zIndex: 1, color: fontColor, transform: `scale(${r4(scale)})`, textShadow: shadows(outline, ...glow) }}
              >
                {w.word}
              </span>
            );
          }
          // Past words shrink back over 0.3 s after the next word starts.
          const t = i < activeWordIndex ? sinceNext(words, i, time) : Infinity;
          const scale = interpolate(t, [0, 0.3], [1.15, 0.9], Ease.ease);
          const opacity = interpolate(t, [0, 0.3], [1, w.keyword ? 0.8 : 0.5], Ease.ease);
          return (
            <span
              key={key}
              style={{
                ...base,
                display: 'inline-block',
                marginInline: growRoom(w.word, w.keyword ? 1.2 : 1.15, config),
                color: w.keyword ? kwColor : fontColor,
                opacity: r4(opacity),
                transform: `scale(${r4(scale)})`,
                textShadow: shadows(outline, restGlow > 0 && `0 0 ${r4(restGlow)}em ${restColor}`),
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
