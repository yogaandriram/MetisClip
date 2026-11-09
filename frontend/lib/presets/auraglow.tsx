import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, clamp, interpolate, r4 } from './anim';
import { highlight, keywordColor, rowStyle, shadows, sinceNext, stroke, textBase } from './style';
import { growRoom } from './metrics';
import { LayeredText } from './parts';

export const auraglowPreset: SubtitlePreset = {
  id: 'auraglow',
  name: 'AURA GLOW',
  wordsPerPage: 3,
  // Rounded geometric sans; the active word gets a violet-cyan gradient glow
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Outfit',
    fontSize: 34,
    fontWeight: 'Extra-Bold',
    isItalic: false,
    isUnderline: false,
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 4,
    shadowBlur: 10,
    highlightColor: baseHighlightColor || '#7B61FF',
    letterSpacing: 0,
    lineHeight: 1.2,
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#1856FF';
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
          fontFamily: "'Outfit', var(--font-display)",
          fontSize: '24px',
          fontWeight: '900',
          textTransform: "uppercase",
          boxShadow: isSelected ? '0 0 20px rgba(24, 86, 255, 0.3)' : 'none',
          overflow: 'hidden'
        }}
      >
        <span style={{ 
          backgroundImage: `linear-gradient(90deg, ${activeColor}, #00FFFF, ${activeColor})`,
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
          filter: `drop-shadow(0 0 12px ${activeColor}) drop-shadow(0 4px 8px rgba(0,0,0,0.8))`,
          display: 'inline-block',
          animation: 'springPopBtn 2s infinite alternate cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          AURA
        </span>
        <style>
          {`
            @keyframes springPopBtn {
              0% { transform: rotateX(-40deg) translateY(10px) scale(0.9); background-position: 0% center; }
              100% { transform: rotateX(0deg) translateY(0) scale(1.1); background-position: 200% center; }
            }
          `}
        </style>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const fontColor = config.fontColor || '#ffffff';
    const activeColor = highlight(config, '#00F0FF');
    const kwColor = keywordColor(config, fontColor, '#00F0FF');
    const base = textBase(config);
    const outline = stroke(config);
    const restShadow = shadows(outline, '0 0.111em 0.277em rgba(0,0,0,0.5)');

    return (
      <span style={{ ...rowStyle(0.3), perspective: '22em' }}>
        {words.map((w, i) => {
          const key = `${i}-${w.start}`;
          if (i === activeWordIndex) {
            // springPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)
            const t = time - w.start;
            const rot = interpolate(t, [0, 0.5], [-60, 0], Ease.backOut);
            const ty = interpolate(t, [0, 0.5], [0.555, 0], Ease.backOut);
            const scale = interpolate(t, [0, 0.5], [0.8, w.keyword ? 1.18 : 1.1], Ease.backOut);
            const opacity = clamp(interpolate(t, [0, 0.5], [0, 1], Ease.backOut));
            const bgPos = clamp(interpolate(t, [0, 0.5], [0, 200], Ease.backOut), 0, 200);
            return (
              <LayeredText
                key={key}
                text={w.word}
                base={base}
                outer={{
                  marginInline: growRoom(w.word, w.keyword ? 1.18 : 1.1, config),
                  transform: `rotateX(${r4(rot)}deg) translateY(${r4(ty)}em) scale(${r4(scale)})`,
                  transformStyle: 'preserve-3d',
                  opacity: r4(opacity),
                }}
                back={{ textShadow: shadows(outline) }}
                front={{
                  backgroundImage: `linear-gradient(90deg, ${activeColor}, #00FFFF, ${activeColor})`,
                  backgroundSize: '200% auto',
                  backgroundPosition: `${r4(bgPos)}% center`,
                  color: 'transparent',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: `drop-shadow(0 0 0.416em ${activeColor}) drop-shadow(0 0.138em 0.277em rgba(0,0,0,0.8))`,
                }}
              />
            );
          }
          // Past words tip back over 0.2 s after the next word starts; upcoming words wait tilted.
          const t = i < activeWordIndex ? sinceNext(words, i, time) : Infinity;
          const rot = interpolate(t, [0, 0.2], [0, 40], Ease.ease);
          const scale = interpolate(t, [0, 0.2], [1.1, 0.9], Ease.ease);
          return (
            <LayeredText
              key={key}
              text={w.word}
              base={base}
              outer={{ marginInline: growRoom(w.word, w.keyword ? 1.18 : 1.1, config), transform: `rotateX(${r4(rot)}deg) scale(${r4(scale)})`, transformStyle: 'preserve-3d', opacity: 0.8 }}
              back={{ textShadow: restShadow }}
              front={{ color: w.keyword ? kwColor : fontColor }}
            />
          );
        })}
      </span>
    );
  },
};
