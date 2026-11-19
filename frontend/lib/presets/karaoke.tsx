import React from 'react';
import { SubtitlePreset, generateRoundedStroke, type CaptionWord } from './types';
import { Ease, clamp, interpolate, r4 } from './anim';
import { backingTone, contrastHalo, dropShadow, keywordColor, luminance, readableOnDark, rowStyle, shadows, sinceNext, stroke, textBase } from './style';
import { growRoom } from './metrics';
import { LayeredText } from './parts';

// Karaoke sweep: every word of the page is readable in the text color from the moment the page shows,
// and the highlight color fills each word from left to right while it is spoken. Words already spoken
// keep the color, so the viewer follows the rhythm of the speech.
const SWEEP_SHARE = 0.85; // the sweep ends a little before the word does
const SWEEP_MIN = 0.12; // a very short word still shows a visible sweep
const SWEEP_MAX = 0.6; // Whisper often stretches a word's end into the pause after it

/**
 * 0..1: how far the color has swept through word `i` at caption time `time`. Linear over the spoken
 * part of the word, and always complete when the next word of the page starts.
 */
export function sweepProgress(words: CaptionWord[], i: number, time: number): number {
  const w = words[i];
  if (!w || time <= w.start) return 0;
  let d = clamp((w.end - w.start) * SWEEP_SHARE, SWEEP_MIN, SWEEP_MAX);
  const next = words[i + 1];
  if (next && next.start > w.start) d = Math.min(d, next.start - w.start);
  return clamp((time - w.start) / d);
}

/** Text color left of `p` (0..1), the other color right of it: a hard edge, like a karaoke screen. */
const sweepFill = (p: number, done: string, rest: string): string => {
  const at = `${r4(p * 100)}%`;
  return `linear-gradient(90deg, ${done} 0%, ${done} ${at}, ${rest} ${at}, ${rest} 100%)`;
};

export const karaokePreset: SubtitlePreset = {
  id: 'karaoke',
  name: 'KARAOKE SAPU',
  wordsPerPage: 3,
  // Heavy uppercase with a thick outline: white words read on any frame, the sweep color shows the rhythm
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Montserrat',
    fontSize: 34,
    fontWeight: 'Black',
    isItalic: false,
    isUnderline: false,
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 4,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 3,
    shadowBlur: 6,
    highlightColor: baseHighlightColor || '#FFD43B',
    letterSpacing: 0,
    lineHeight: 1.1,
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => (
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
        overflow: 'hidden',
      }}
    >
      <style>
        {`
          .mc-karaoke-btn { animation: karaokeSweepButton 2.2s linear infinite; }
          @keyframes karaokeSweepButton {
            0% { background-position: 100% 0; }
            70% { background-position: 0% 0; }
            100% { background-position: 0% 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .mc-karaoke-btn { animation: none; background-position: 40% 0; }
          }
        `}
      </style>
      <span style={{ position: 'relative', display: 'inline-block', fontFamily: "'Montserrat', var(--font-display)", fontSize: '24px', fontWeight: 900, lineHeight: 1.1 }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, color: 'transparent', textShadow: generateRoundedStroke(3, '#000000', 24) }}>
          KARAOKE
        </span>
        {/* The class carries the animation (not an inline style), so reduced motion can switch it off */}
        <span
          className="mc-karaoke-btn"
          style={{
            position: 'relative',
            display: 'inline-block',
            backgroundImage: 'linear-gradient(90deg, #FFD43B 50%, #FFFFFF 50%)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          KARAOKE
        </span>
      </span>
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const fontColor = config.fontColor || '#FFFFFF';
    const base = textBase(config);
    const outline = stroke(config);
    // The sweep color must stand out from a dark outline (a navy brand color would sink into black):
    // lightened just enough for 3:1 against it, keeping its hue.
    const rim = outline ? config.strokeColor || '#000000' : backingTone(fontColor) === '0, 0, 0' ? '#000000' : null;
    const rimLum = rim ? luminance(rim) : null;
    const picked = keywordColor(config, fontColor, '#FFD43B');
    const sweep = rimLum !== null && rimLum < 0.18 ? readableOnDark(picked, rimLum, 3) : picked;
    // Without an outline the words get a halo, so white text still reads on a white shirt
    const textShadow = shadows(outline, outline ? null : contrastHalo(fontColor), dropShadow(config));

    return (
      <span style={{ ...rowStyle(0.26), padding: '0.12em 0.2em' }}>
        {words.map((w, i) => {
          const peak = w.keyword ? 1.14 : 1.06;
          const rest = w.keyword ? 1.06 : 1;
          let scale = 1;
          if (i === activeWordIndex) scale = interpolate(time - w.start, [0, 0.1], [1, peak], Ease.easeOut);
          else if (i < activeWordIndex) scale = interpolate(sinceNext(words, i, time), [0, 0.12], [peak, rest], Ease.easeOut);
          return (
            <LayeredText
              key={`${i}-${w.start}`}
              text={w.word}
              base={base}
              outer={{ marginInline: growRoom(w.word, peak, config), transform: `scale(${r4(scale)})`, transformOrigin: '50% 60%' }}
              back={{ textShadow }}
              front={{
                backgroundImage: sweepFill(sweepProgress(words, i, time), sweep, fontColor),
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
              }}
            />
          );
        })}
      </span>
    );
  },
};
