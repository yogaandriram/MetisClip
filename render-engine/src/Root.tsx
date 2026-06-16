import { Composition, getInputProps } from 'remotion';
import { SubtitleOverlay } from './SubtitleOverlay';

export type MyCompositionProps = {
  videoUrl: string;
  words: any[];
  style: any;
  brandSettings?: any;
  durationInFrames?: number;
};

export const RemotionRoot: React.FC = () => {
  const props = getInputProps() as MyCompositionProps;
  const duration = props.durationInFrames || 300;

  return (
    <>
      <Composition
        id="SubtitleOverlay"
        component={SubtitleOverlay}
        durationInFrames={duration}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          videoUrl: props.videoUrl || '',
          words: props.words || [],
          style: props.style || {},
          brandSettings: props.brandSettings || {}
        }}
      />
    </>
  );
};
