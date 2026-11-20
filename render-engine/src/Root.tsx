import { Composition } from 'remotion';
import { outputFrameAt } from '../../frontend/lib/presets/captions';
import { FPS, OverlayProps, SubtitleOverlay, overlaySegments } from './SubtitleOverlay';

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
          const durationInFrames = Math.max(1, total || sourceFrames);
          // The output frame of the chosen cover (cuts move it), reported by the render worker
          const coverFrame =
            typeof props.coverTime === 'number'
              ? Math.min(durationInFrames - 1, segments.length ? outputFrameAt(segments, props.coverTime, FPS) : Math.round(props.coverTime * FPS))
              : null;
          return { durationInFrames, props: { ...props, coverFrame } };
        }}
      />
    </>
  );
};
