import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Series,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
// Shared with the editor preview (preview == render). Never fork these files.
// @ts-ignore - lives outside this package's tsconfig root
import { CaptionLayer } from '../../frontend/lib/presets/CaptionLayer';
// @ts-ignore
import { LogoOverlay } from '../../frontend/lib/presets/BrandOverlay';
// @ts-ignore
import { resolveCaptionStyle } from '../../frontend/lib/presets/defaults';
// @ts-ignore
import { primaryFamily } from '../../frontend/lib/presets/style';
// @ts-ignore
import { computeKeepSegments, frameSegments, isCut, resolveAi, sourceTimeAt } from '../../frontend/lib/presets/captions';
// @ts-ignore
import { LayoutStage } from '../../frontend/lib/presets/LayoutStage';
// @ts-ignore
import { headerText, resolveLayout } from '../../frontend/lib/presets/layout';
// Bundled woff2 files (offline, deterministic). See scripts/gen-fonts.cjs.
import { FONT_WEIGHTS } from './fonts';

export type OverlayProps = {
  videoUrl: string;
  words: any[];
  style: any;
  brandSettings?: any;
  /** Effective AI subtitle settings (brand template ⊕ clip override). */
  ai?: any;
  /** Length of the SOURCE clip (raw.mp4) in frames. The output can be shorter when pauses are cut. */
  durationInFrames?: number;
  /** Effective layout (brand template ⊕ clip override), lib/presets/layout.ts. */
  layout?: any;
  /** The clip in its original ratio (source.mp4, same timeline as raw.mp4), for the podcast layout. */
  sourceUrl?: string;
  /** Width / height of sourceUrl. */
  sourceAspect?: number;
  /** The clip's title (hook text) and the YouTube channel, for the layout's header and credit. */
  title?: string;
  channel?: string;
};

export const FPS = 30;

/** Kept source ranges in frames for these props (also used by calculateMetadata in Root.tsx). */
export function overlaySegments(props: OverlayProps, fps: number) {
  const sourceFrames = Math.max(1, Math.round(Number(props.durationInFrames) || 0) || 300);
  const style = resolveCaptionStyle(props.style || {});
  const ai = resolveAi(props.ai);
  const duration = sourceFrames / fps;
  const kept = computeKeepSegments(Array.isArray(props.words) ? props.words : [], duration, ai, (style.offsetTime || 0) / 1000);
  const segments = frameSegments(kept, fps);
  return { segments, cut: isCut(kept, duration), sourceFrames };
}

const resolveSrc = (url: string | undefined) =>
  !url || /^(https?:|file:|blob:|data:)/.test(url) ? url || '' : staticFile(url);

export const SubtitleOverlay: React.FC<OverlayProps> = (props) => {
  const { brandSettings } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words: any[] = Array.isArray(props.words) ? props.words : [];
  const style = useMemo(() => resolveCaptionStyle(props.style || {}), [props.style]);
  const ai = useMemo(() => resolveAi(props.ai), [props.ai]);
  const layout = useMemo(() => resolveLayout(props.layout), [props.layout]);
  const { segments, cut } = useMemo(() => overlaySegments(props, fps), [props, fps]);
  // Podcast layout needs the original-ratio source; without one the clip stays full-frame
  const podcast = layout.mode === 'podcast' && !!props.sourceUrl;
  const stageLayout = podcast ? layout : { ...layout, mode: 'full' as const };

  // Hold the frame until every font on screen (all bundled weights) is loaded from the local bundle.
  const families = useMemo(() => {
    const list = [primaryFamily(style.fontFamily)];
    if (podcast && headerText(layout, props.title)) list.push(primaryFamily(layout.header.fontFamily));
    return Array.from(new Set(list));
  }, [style.fontFamily, podcast, layout, props.title]);
  const familyKey = families.join('|');
  const [handle] = useState(() => delayRender(`Memuat font ${familyKey}`, { timeoutInMilliseconds: 60000 }));

  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      continueRender(handle);
    };
    const loads = families.flatMap((family) =>
      (FONT_WEIGHTS[family] || [400, 700]).map((w) =>
        document.fonts.load(`${w} 48px "${family}"`).catch((err) => {
          console.warn(`Font ${family} ${w} gagal dimuat`, err);
          return [];
        }),
      ),
    );
    // Safety net: never block the render forever if a face is missing (falls back to sans-serif).
    const timer = setTimeout(() => {
      console.warn(`Font ${familyKey} belum siap setelah 15 s, lanjut render`);
      finish();
    }, 15000);
    Promise.all(loads)
      .then(() => document.fonts.ready)
      .then(() => {
        clearTimeout(timer);
        finish();
      });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyKey, handle]);

  const src = resolveSrc(podcast ? props.sourceUrl : props.videoUrl);
  // Caption time follows the SOURCE timeline, so cut pauses do not shift the subtitles.
  const sourceTime = cut ? sourceTimeAt(segments, frame, fps) : frame / fps;
  const FADE = 2; // frames of audio fade at each cut (avoids clicks)

  // The same kept ranges for every video on screen (framed source and blurred background)
  const renderVideo = (role: 'main' | 'background', videoStyle: React.CSSProperties) => {
    if (!src) return null;
    const muted = role === 'background';
    if (!cut) {
      // OffthreadVideo: frame-exact extraction by the Remotion compositor (no browser seeking)
      return <OffthreadVideo src={src} style={videoStyle} muted={muted} />;
    }
    return (
      <Series>
        {segments.map((s, i) => (
          <Series.Sequence key={`${s.startFrame}-${i}`} durationInFrames={s.durationInFrames}>
            <OffthreadVideo
              src={src}
              trimBefore={s.startFrame}
              trimAfter={s.endFrame}
              style={videoStyle}
              muted={muted}
              volume={
                muted
                  ? 0
                  : (f) => {
                      const fadeIn = s.startFrame > 0 ? interpolate(f, [0, FADE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
                      const fadeOut =
                        i < segments.length - 1
                          ? interpolate(f, [s.durationInFrames - FADE, s.durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
                          : 1;
                      return Math.min(fadeIn, fadeOut);
                    }
              }
            />
          </Series.Sequence>
        ))}
      </Series>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: 'black', containerType: 'inline-size' }}>
      <LayoutStage
        layout={stageLayout}
        aspect={Number(props.sourceAspect) || 16 / 9}
        title={props.title}
        channel={props.channel}
        backgroundImageUrl={resolveSrc(layout.background.imageUrl)}
        renderVideo={renderVideo}
        ImgComponent={Img}
      />

      <LogoOverlay src={brandSettings?.overlayUrl || ''} brand={brandSettings} ImgComponent={Img} />

      <CaptionLayer words={words} time={sourceTime} style={style} ai={ai} />
    </AbsoluteFill>
  );
};
