import React, { useEffect, useState } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, OffthreadVideo, Img, delayRender, continueRender, staticFile } from 'remotion';
// Shared with the editor preview (preview == render). Never fork these presets.
// @ts-ignore - lives outside this package's tsconfig root
import { presets } from '../../frontend/lib/presets/index';
// Bundled woff2 files (offline, deterministic). See scripts/gen-fonts.cjs.
import { FONT_WEIGHTS } from './fonts';

/** First family of a CSS font-family list, without quotes: "'Exo 2', sans-serif" -> "Exo 2" */
const primaryFamily = (value: string): string =>
  (value.split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '') || 'Montserrat';

export const SubtitleOverlay: React.FC<{
  videoUrl: string;
  words: any[];
  style: any;
  brandSettings?: any;
}> = ({ videoUrl, words, style: styleProp, brandSettings }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = styleProp || {};
  const safeWords: any[] = Array.isArray(words) ? words : [];

  const currentTime = frame / fps;

  // Determine preset
  const mode = style.mode || 'popshadow';
  const activePreset = presets.find((p: any) => p.id === mode) || presets[0];

  // Merge missing styles with preset defaults, just like the frontend does
  const mergedStyle = { ...activePreset.getDefaultConfig(brandSettings?.highlightColor), ...style };

  const finalFontFamily = primaryFamily(mergedStyle.fontFamily || style.fontFamily || 'Montserrat');

  // Hold the frame until the chosen family (every bundled weight) is loaded from the local bundle.
  const [handle] = useState(() => delayRender(`Memuat font ${finalFontFamily}`, { timeoutInMilliseconds: 60000 }));

  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      continueRender(handle);
    };
    const weights = FONT_WEIGHTS[finalFontFamily] || [400, 700];
    const loads = weights.map((w) =>
      document.fonts.load(`${w} 48px "${finalFontFamily}"`).catch((err) => {
        console.warn(`Font ${finalFontFamily} ${w} gagal dimuat`, err);
        return [];
      })
    );
    // Safety net: never block the render forever if a face is missing (falls back to sans-serif).
    const timer = setTimeout(() => {
      console.warn(`Font ${finalFontFamily} belum siap setelah 15 s, lanjut render`);
      finish();
    }, 15000);
    Promise.all(loads)
      .then(() => document.fonts.ready)
      .then(() => {
        clearTimeout(timer);
        finish();
      });
    return () => clearTimeout(timer);
  }, [finalFontFamily, handle]);

  // Terapkan fitur Sinkronisasi Suara (Offset/Delay)
  const offsetTime = style.offsetTime || 0; // ms
  const adjustedTime = currentTime - (offsetTime / 1000);

  // Find active word index based on adjustedTime
  let activeWordIndex = -1;
  for (let i = 0; i < safeWords.length; i++) {
    const w = safeWords[i];
    if (adjustedTime >= w.start && adjustedTime <= w.end) {
      activeWordIndex = i;
      break;
    }
  }

  const processedVideoUrl = !videoUrl || /^(https?:|file:|blob:|data:)/.test(videoUrl) ? videoUrl : staticFile(videoUrl);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* OffthreadVideo: frame-exact extraction by the Remotion compositor (no browser seeking, no Range requirement) */}
      {videoUrl && <OffthreadVideo src={processedVideoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}

      {/* Brand Logo Overlay */}
      {brandSettings && brandSettings.overlayUrl && (
        <AbsoluteFill style={{ zIndex: 5 }}>
          <div
            style={{
              position: 'absolute',
              top: `${((brandSettings.logoPosition?.y || 15) / 533) * 100}%`,
              left: `${((brandSettings.logoPosition?.x || 15) / 300) * 100}%`,
              width: `${((60 * (brandSettings.logoScale || 1)) / 300) * 100}%`,
              height: 'auto'
            }}
          >
            <Img
              src={brandSettings.overlayUrl}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
         <div style={{
           position: 'absolute',
           bottom: `${((mergedStyle.positionY ?? 80) / 533) * 100}%`,
           left: '10%',
           right: '10%',
           width: '80%',
           textAlign: 'center',
           fontSize: `calc(${mergedStyle.fontSize ?? 46}vw / 6)`,
           fontFamily: `"${finalFontFamily}", sans-serif`,
           fontWeight: mergedStyle.fontWeight === 'Bold' || mergedStyle.fontWeight === 'Black' ? 900 : (mergedStyle.fontWeight === 'Medium' ? 500 : 400),
           color: mergedStyle.fontColor || '#FFFFFF',
           fontStyle: mergedStyle.isItalic ? 'italic' : 'normal',
           textDecoration: mergedStyle.isUnderline ? 'underline' : 'none',
           textTransform: mergedStyle.isUppercase ? 'uppercase' : 'none',
           lineHeight: mergedStyle.lineHeight || 1.2
         }}>
            {activeWordIndex >= 0 && activePreset.renderPreview({
              words: safeWords,
              activeWordIndex,
              config: mergedStyle
            })}
         </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
