import React from 'react';

/**
 * Text drawn twice: an outline/shadow copy behind and the fill (e.g. a gradient) on top.
 * Needed because text-shadow shows through a transparent (background-clipped) fill.
 */
export const LayeredText: React.FC<{
  text: string;
  base: React.CSSProperties;
  back: React.CSSProperties;
  front: React.CSSProperties;
  outer?: React.CSSProperties;
}> = ({ text, base, back, front, outer }) => (
  <span style={{ position: 'relative', display: 'inline-block', ...outer }}>
    <span
      aria-hidden
      style={{ ...base, display: 'inline-block', position: 'absolute', left: 0, top: 0, color: 'transparent', WebkitTextFillColor: 'transparent', ...back }}
    >
      {text}
    </span>
    <span style={{ ...base, display: 'inline-block', position: 'relative', ...front }}>{text}</span>
  </span>
);
