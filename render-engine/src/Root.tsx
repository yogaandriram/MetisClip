import { Composition } from 'remotion';
import { FPS, OverlayProps, SubtitleOverlay, overlaySegments } from './SubtitleOverlay';

export type MyCompositionProps = OverlayProps;

const DEFAULT_PROPS: OverlayProps = {
  videoUrl: '',
  words: [],
  style: {},
  brandSettings: {},
  ai: {},
  durationInFrames: 300,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SubtitleOverlay"
        component={SubtitleOverlay}
        durationInFrames={300}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
        // Output length = kept source ranges (silent pauses / filler words can be cut).
        calculateMetadata={({ props }) => {
          const { segments, sourceFrames } = overlaySegments(props, FPS);
          const total = segments.reduce((sum, s) => sum + s.durationInFrames, 0);
          return { durationInFrames: Math.max(1, total || sourceFrames) };
        }}
      />
    </>
  );
};
