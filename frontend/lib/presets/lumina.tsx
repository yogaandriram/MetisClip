import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, interpolate, r4 } from './anim';
import {
  contrastRatio,
  dropShadow,
  em,
  highlight,
  keywordColor,
  luminance,
  readableOnDark,
  rowStyle,
  shadows,
  stroke,
  textBase,
  withAlpha,
} from './style';

// Legible on any video, from a white shirt to a black studio (QA 2026-11-19: the words were 40 %
// opaque and the spoken word sat on a 15 % white pill, so a bright frame swallowed the caption).
// Dark glass behind the spoken word: over a white frame it is still dark enough for white text (7:1)
// and for a highlight color lightened to 3:1 (large text).
const PILL_ALPHA = 0.66;
const PILL_LUMINANCE = luminance('#575757') as number; // the pill over a white frame: 255 * (1 - PILL_ALPHA)
const REST_OPACITY = 0.85; // the other words of the page

/** A soft halo in the opposite tone, so a word without its pill stays readable on any frame (`k` scales it). */
function halo(color: string, k = 1): string | null {
  if (k <= 0.001) return null;
  const l = luminance(color) ?? 1;
  const c = contrastRatio(l, 0) >= contrastRatio(l, 1) ? '0, 0, 0' : '255, 255, 255'; // teal gets a dark one
  const a = (x: number) => r4(x * k);
  return `0 0 0.05em rgba(${c}, ${a(0.8)}), 0 0 0.2em rgba(${c}, ${a(0.75)}), 0 0.04em 0.12em rgba(${c}, ${a(0.6)})`;
}

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
    // The spoken word sits on dark glass, so its color is lightened where it would be too dark to read
    const activeColor = readableOnDark(highlight(config, '#FFFFFF'), PILL_LUMINANCE);
    const kwColor = keywordColor(config, fontColor, '#00FFCC');
    const base = textBase(config);
    const spacing = em(config.letterSpacing, config);

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
            // The glass pill fades in under a word that was already readable: no dip, no blur. Spoken
            // words last about 0.3 s, so the word is fully shown within 0.15 s and settles by 0.3 s.
            const t = time - w.start;
            const shown = interpolate(t, [0, 0.15], [0, 1], Ease.easeOut);
            const ty = interpolate(t, [0, 0.3], [0.2, 0], Ease.easeOut);
            const scale = interpolate(t, [0, 0.3], [0.92, w.keyword ? 1.08 : 1], Ease.easeOut);
            const extra = interpolate(t, [0, 0.3], [0, 0.08], Ease.easeOut);
            return (
              <span
                key={key}
                style={{
                  ...pill,
                  background: `rgba(0, 0, 0, ${r4(PILL_ALPHA * shown)})`,
                  backdropFilter: 'blur(0.28em)',
                  WebkitBackdropFilter: 'blur(0.28em)',
                  borderColor: `rgba(255, 255, 255, ${r4(0.22 * shown)})`,
                  color: activeColor,
                  letterSpacing: `${r4(spacing + extra)}em`,
                  // The halo it had as a waiting word fades out while the pill fades in
                  textShadow: shadows(stroke(config), halo(activeColor, 1 - shown), `0 0 0.28em ${withAlpha(activeColor, 0.55)}`, '0 0.055em 0.11em rgba(0,0,0,0.5)'),
                  boxShadow: `0 0.11em 0.42em rgba(0, 0, 0, ${r4(0.25 * shown)})`,
                  opacity: r4(REST_OPACITY + (1 - REST_OPACITY) * shown),
                  transform: `translateY(${r4(ty)}em) scale(${r4(scale)})`,
                }}
              >
                {w.word}
              </span>
            );
          }
          const color = w.keyword ? kwColor : fontColor;
          return (
            <span
              key={key}
              style={{
                ...pill,
                color,
                opacity: w.keyword ? 1 : REST_OPACITY,
                transform: 'scale(0.95)',
                textShadow: shadows(stroke(config), halo(color), dropShadow(config)), // halo above a black drop shadow
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
