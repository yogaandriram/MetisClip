import React, { useMemo } from 'react';
import type { CaptionWord } from './types';
import { type CaptionStyle, DESIGN_CANVAS, getPreset } from './defaults';
import { type AiCaptionSettings, buildPages, captionAt, displayWords, resolveAi } from './captions';
import { fitScale, lineChars } from './metrics';
import { Ease, interpolate, r4 } from './anim';

/**
 * The caption as it appears on the video: position, size, the active preset and the AI emoji.
 * Used unchanged by the clip editor, the Brand Template preview and the Remotion render.
 *
 * The parent must be the 9:16 video box with `container-type: inline-size`: the font size is in
 * `cqw`, so the caption scales with the video exactly like the 1080×1920 export.
 */
export interface CaptionLayerProps {
  words: CaptionWord[];
  /** Playback time of the source video in seconds. */
  time: number;
  style: CaptionStyle;
  ai?: Partial<AiCaptionSettings> | null;
  zIndex?: number;
}

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

export const CaptionLayer: React.FC<CaptionLayerProps> = ({ words, time, style, ai, zIndex = 10 }) => {
  const preset = getPreset(style.mode);
  const settings = resolveAi(ai);
  const display = useMemo(
    () => displayWords(words, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, settings.fillerWords, settings.keywords, settings.emojis],
  );
  const maxChars = lineChars(style);
  const pages = useMemo(() => buildPages(display, preset.wordsPerPage, maxChars), [display, preset.wordsPerPage, maxChars]);

  const t = time - (style.offsetTime || 0) / 1000;
  const frame = captionAt(pages, t);
  const fit = frame ? fitScale(frame.page.words, style) : 1;

  let emoji: { char: string; start: number } | null = null;
  if (frame) {
    for (let i = frame.activeIndex; i >= 0; i--) {
      const w = frame.page.words[i];
      if (w.emoji && w.start <= t) {
        emoji = { char: w.emoji, start: w.start };
        break;
      }
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: '10%',
        width: '80%',
        bottom: `${r4((style.positionY / DESIGN_CANVAS.height) * 100)}%`,
        textAlign: 'center',
        fontSize: `calc(${style.fontSize}cqw / 6)`,
        lineHeight: style.lineHeight,
        color: style.fontColor,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex,
      }}
    >
      {frame && (
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', width: '100%', fontSize: fit < 1 ? `${r4(fit)}em` : undefined, opacity: r4(1 - frame.exit) }}>
          {emoji && <EmojiBadge char={emoji.char} t={t - emoji.start} />}
          {preset.renderPreview({ words: frame.page.words, activeWordIndex: frame.activeIndex, time: t, config: style })}
        </div>
      )}
    </div>
  );
};

const EmojiBadge: React.FC<{ char: string; t: number }> = ({ char, t }) => {
  const scale = interpolate(t, [0, 0.16, 0.3], [0.2, 1.25, 1], Ease.easeOut);
  const opacity = interpolate(t, [0, 0.08], [0, 1]);
  const rotate = interpolate(t, [0, 0.16, 0.3], [-18, 8, 0], Ease.easeOut);
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '100%',
        marginBottom: '0.15em',
        fontFamily: EMOJI_FONT,
        fontSize: '1.45em',
        lineHeight: 1,
        fontStyle: 'normal',
        textTransform: 'none',
        transform: `translateX(-50%) scale(${r4(scale)}) rotate(${r4(rotate)}deg)`,
        transformOrigin: 'center bottom',
        opacity: r4(opacity),
        filter: 'drop-shadow(0 0.06em 0.12em rgba(0,0,0,0.45))',
      }}
    >
      {char}
    </div>
  );
};
