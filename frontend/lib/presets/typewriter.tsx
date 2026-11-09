import React from 'react';
import { SubtitlePreset } from './types';
import { cycle, r4 } from './anim';
import { em, highlight, keywordColor, rowStyle, shadows, stroke, textBase } from './style';

export const typewriterPreset: SubtitlePreset = {
  id: 'typewriter',
  name: 'TYPEWRITER',
  wordsPerPage: 4,
  // Terminal look: monospace green, the word being typed is white
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Courier New',
    fontSize: 30,
    fontWeight: 'Bold',
    isItalic: false,
    isUnderline: false,
    isUppercase: false,
    fontColor: '#00FF88',
    strokeColor: '#000000',
    strokeWidth: 2,
    hasShadow: true,
    shadowColor: '#00FF88',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 6,
    highlightColor: baseHighlightColor || '#FFFFFF',
    letterSpacing: 0,
    lineHeight: 1.25,
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#00FF88';
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
          fontFamily: "'Courier New', monospace",
          fontSize: '24px',
          fontWeight: '700',
          boxShadow: isSelected ? `0 0 20px rgba(0, 255, 136, 0.2)` : 'none',
          overflow: 'hidden',
          color: '#ffffff'
        }}
      >
        <style>
          {`
            @keyframes blinkBtn {
              50% { border-color: transparent; }
            }
            .type-btn-text {
              color: ${activeColor};
              border-right: 3px solid ${activeColor};
              white-space: nowrap;
              padding-right: 5px;
              animation: blinkBtn 0.7s infinite;
              text-shadow: 0 0 8px ${activeColor};
              display: inline-block;
            }
          `}
        </style>
        <span className="type-btn-text">
          TYPEWRITER
        </span>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const fontColor = config.fontColor || '#00FF88';
    const activeColor = highlight(config, '#00FF88');
    const kwColor = keywordColor(config, fontColor, '#00FF88');
    const base = textBase(config, { generic: 'monospace', fallbackFamily: 'Courier New' });
    const glow = config.hasShadow ? em(config.shadowBlur || 10, config) : 0;
    const glowColor = config.shadowColor || activeColor;
    const glowShadow = (color: string) => shadows(stroke(config), glow > 0 && `0 0 ${r4(glow)}em ${color}`);

    return (
      <span style={{ ...rowStyle(0.5), padding: '0.28em' }}>
        {words.map((w, i) => {
          const key = `${i}-${w.start}`;
          const text = w.word;
          if (i < activeWordIndex) {
            return (
              <span key={key} style={{ ...base, display: 'inline-block', color: w.keyword ? kwColor : fontColor, textShadow: glowShadow(w.keyword ? kwColor : glowColor) }}>
                {text}
              </span>
            );
          }
          if (i > activeWordIndex) {
            // Upcoming words keep their place (invisible), so the typed line never re-centers.
            return (
              <span key={key} aria-hidden style={{ ...base, display: 'inline-block', visibility: 'hidden' }}>
                {text}
              </span>
            );
          }
          // typewriterAnim 0.3s, one character at a time, with a blinking cursor (0.7s)
          const chars = Array.from(text);
          const typed = Math.max(1, Math.min(chars.length, Math.ceil(chars.length * ((time - w.start) / 0.3))));
          const cursorOn = typed < chars.length || cycle(time - w.start, 0.7) < 0.5;
          const color = w.keyword ? kwColor : activeColor;
          return (
            <span key={key} style={{ ...base, display: 'inline-block', position: 'relative', color, textShadow: glowShadow(color) }}>
              <span style={{ position: 'relative' }}>
                {chars.slice(0, typed).join('')}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    right: '-0.08em',
                    top: '0.08em',
                    bottom: '0.08em',
                    width: '0.08em',
                    background: color,
                    opacity: cursorOn ? 1 : 0,
                  }}
                />
              </span>
              <span style={{ visibility: 'hidden' }}>{chars.slice(typed).join('')}</span>
            </span>
          );
        })}
      </span>
    );
  },
};
