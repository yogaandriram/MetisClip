import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Video } from 'remotion';
// @ts-ignore
import { presets } from '../../frontend/lib/presets/index';

export const SubtitleOverlay: React.FC<{
  videoUrl: string;
  words: any[];
  style: any;
}> = ({ videoUrl, words, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTime = frame / fps;

  // Find active word index based on currentTime
  let activeWordIndex = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (currentTime >= w.start && currentTime <= w.end) {
      activeWordIndex = i;
      break;
    }
  }

  // Determine preset
  const mode = style.mode || 'popshadow';
  const activePreset = presets.find((p: any) => p.id === mode) || presets[0];

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {videoUrl && <Video src={videoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
         <div style={{ position: 'absolute', bottom: `${style.positionY || 80}px`, left: '15%', right: '15%', width: '70%', textAlign: 'center' }}>
            {activePreset.renderPreview({
              words,
              activeWordIndex,
              config: style
            })}
         </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
