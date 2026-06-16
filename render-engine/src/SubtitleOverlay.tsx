import React, { useEffect, useState } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Video, Img, delayRender, continueRender, staticFile } from 'remotion';
// @ts-ignore
import { presets } from '../../frontend/lib/presets/index';

export const SubtitleOverlay: React.FC<{
  videoUrl: string;
  words: any[];
  style: any;
  brandSettings?: any;
}> = ({ videoUrl, words, style, brandSettings }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTime = frame / fps;

  const fontFamily = style.fontFamily || 'Montserrat';
  const googleFontUrl = `https://fonts.googleapis.com/css?family=${fontFamily.replace(/ /g, '+')}:400,500,600,700,800,900&display=swap`;

  const [fontLoaded, setFontLoaded] = useState(false);
  const [handle] = useState(() => delayRender(`Loading font ${fontFamily}`));

  useEffect(() => {
    // Injeksi URL Google Font ke dalam head dokumen Remotion
    const link = document.createElement('link');
    link.href = googleFontUrl;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    
    // Tunggu mesin Chromium memuat font sepenuhnya
    document.fonts.ready.then(() => {
      // Pasang elemen hantu (invisible) untuk memaksa mesin merender font
      const div = document.createElement('div');
      div.style.fontFamily = `"${fontFamily}", sans-serif`;
      div.innerText = 'Test Font Loading';
      div.style.position = 'absolute';
      div.style.opacity = '0';
      document.body.appendChild(div);
      
      // Jeda buffer kecil untuk memastikan font sudah dipoles ke layar sebelum frame diambil
      setTimeout(() => {
        setFontLoaded(true);
        continueRender(handle);
        document.body.removeChild(div);
      }, 800);
    });
  }, [fontFamily, googleFontUrl, handle]);

  // Terapkan fitur Sinkronisasi Suara (Offset/Delay)
  const offsetTime = style.offsetTime || 0; // ms
  const adjustedTime = currentTime - (offsetTime / 1000);

  // Find active word index based on adjustedTime
  let activeWordIndex = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (adjustedTime >= w.start && adjustedTime <= w.end) {
      activeWordIndex = i;
      break;
    }
  }

  // Determine preset
  const mode = style.mode || 'popshadow';
  const activePreset = presets.find((p: any) => p.id === mode) || presets[0];

  const processedVideoUrl = videoUrl.startsWith('http') ? videoUrl : staticFile(videoUrl);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {videoUrl && <Video src={processedVideoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      
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
           bottom: `${((style.positionY || 80) / 533) * 100}%`, 
           left: '10%', 
           right: '10%', 
           width: '80%', 
           textAlign: 'center',
           fontSize: `calc(${style.fontSize || 46}vw / 6)`,
           fontFamily: `"${fontFamily}", sans-serif`,
           fontWeight: style.fontWeight === 'Bold' || style.fontWeight === 'Black' ? 900 : (style.fontWeight === 'Medium' ? 500 : 400),
           color: style.fontColor || '#FFFFFF',
           fontStyle: style.isItalic ? 'italic' : 'normal',
           textDecoration: style.isUnderline ? 'underline' : 'none',
           textTransform: style.isUppercase ? 'uppercase' : 'none',
           WebkitTextStroke: (style.strokeWidth || 0) > 0 ? `${style.strokeWidth}px ${style.strokeColor || '#000000'}` : 'none',
           textShadow: style.hasShadow ? `${style.shadowX || 0}px ${style.shadowY || 0}px ${style.shadowBlur || 0}px ${style.shadowColor || '#000000'}` : ((style.strokeWidth || 0) === 0 ? '2px 2px 0px #000, -2px -2px 0px #000, -2px 2px 0px #000, 2px -2px 0px #000' : 'none'),
           lineHeight: style.lineHeight || 1.2
         }}>
            {activeWordIndex >= 0 && activePreset.renderPreview({
              words,
              activeWordIndex,
              config: style
            })}
         </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
