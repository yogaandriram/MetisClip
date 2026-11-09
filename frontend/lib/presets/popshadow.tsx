import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, clamp, interpolate, r4 } from './anim';
import { dropShadow, highlight, keywordColor, rowStyle, shadows, sinceNext, stroke, textBase } from './style';
import { growRoom } from './metrics';

export const popshadowPreset: SubtitlePreset = {
  id: 'popshadow',
  name: 'POP SHADOW',
  wordsPerPage: 3,
  // Bold TikTok style: heavy sans, thin outline, hard drop shadow
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Montserrat',
    fontSize: 34,
    fontWeight: 'Black',
    isItalic: false,
    isUnderline: false,
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 3,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 4,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#FFE800',
    letterSpacing: 0,
    lineHeight: 1.1,
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#A855F7';
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
          fontFamily: "'Montserrat', var(--font-display)",
          fontSize: '24px',
          fontWeight: '900',
          textTransform: "uppercase",
          boxShadow: isSelected ? '0 0 20px rgba(24, 86, 255, 0.3)' : 'none',
          overflow: 'hidden'
        }}
      >
        <span style={{ 
          color: '#ffffff',
          filter: `drop-shadow(3px 3px 0 ${activeColor})`,
          transform: 'scale(1.1) translateY(-2px)',
          display: 'inline-block',
          animation: 'popShadowButton 2s infinite ease-in-out'
        }}>
          SHADOW
        </span>
        <style>
          {`
            @keyframes popShadowButton {
              0% { transform: scale(0.95) translateY(0); filter: drop-shadow(0px 0px 0 ${activeColor}); }
              50% { transform: scale(1.15) translateY(-4px); filter: drop-shadow(4px 4px 0 ${activeColor}); }
              100% { transform: scale(0.95) translateY(0); filter: drop-shadow(0px 0px 0 ${activeColor}); }
            }
          `}
        </style>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const fontColor = config.fontColor || '#ffffff';
    const activeColor = highlight(config, '#A855F7');
    const kwColor = keywordColor(config, fontColor, '#A855F7');
    const base = textBase(config);
    const textShadow = shadows(stroke(config), dropShadow(config));

    return (
      <span style={{ ...rowStyle(0.3), padding: '0.28em' }}>
        {words.map((w, i) => {
          let scale = 1;
          let ty = 0;
          let opacity = 0.9;
          let color = w.keyword ? kwColor : fontColor;
          if (i === activeWordIndex) {
            // popShadowAnim 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)
            const t = time - w.start;
            const peak = w.keyword ? 1.2 : 1.15;
            scale = interpolate(t, [0, 0.4], [0.8, peak], Ease.backOut);
            ty = interpolate(t, [0, 0.4], [0.277, -0.111], Ease.backOut);
            opacity = clamp(interpolate(t, [0, 0.4], [0, 1], Ease.backOut));
            color = activeColor;
          } else if (i < activeWordIndex) {
            const t = sinceNext(words, i, time);
            scale = interpolate(t, [0, 0.12], [w.keyword ? 1.2 : 1.15, 1], Ease.easeOut);
            ty = interpolate(t, [0, 0.12], [-0.111, 0], Ease.easeOut);
          }
          return (
            <span
              key={`${i}-${w.start}`}
              style={{
                ...base,
                display: 'inline-block',
                marginInline: growRoom(w.word, w.keyword ? 1.2 : 1.15, config),
                color,
                textShadow,
                opacity: r4(opacity),
                transform: `translateY(${r4(ty)}em) scale(${r4(scale)})`,
                transformOrigin: 'center',
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
