import { Composition, getInputProps } from 'remotion';
import { SubtitleOverlay } from './SubtitleOverlay';

export type MyCompositionProps = {
  videoUrl: string;
  words: any[];
  style: any;
};

export const RemotionRoot: React.FC = () => {
  const props = getInputProps() as MyCompositionProps;

  return (
    <>
      <Composition
        id="SubtitleOverlay"
        component={SubtitleOverlay}
        durationInFrames={300} // Fallback, will be overridden by CLI --frames
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          videoUrl: props.videoUrl || '',
          words: props.words || [],
          style: props.style || {}
        }}
      />
    </>
  );
};
