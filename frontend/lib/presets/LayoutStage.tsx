import React from 'react';
import { DESIGN_CANVAS } from './position';
import { r4 } from './anim';
import { cssWeight, primaryFamily } from './style';
import { HEADER_LINE_HEIGHT, HEADER_PAD, type Layout, podcastGeometry } from './layout';

/**
 * The video layer of the 9:16 canvas, laid out by the Brand Template layout (lib/presets/layout.ts).
 * Used unchanged by the clip editor, the Brand Template preview and the Remotion render; the logo and
 * the caption go on top of it (the caller renders them after this).
 *
 * The parent must be the 9:16 box with `container-type: inline-size` (sizes are in `cqw`).
 * `renderVideo` draws the video element for each role with the given style: 'main' is the clip
 * (full) or the framed source (podcast), 'background' the blurred copy behind the frame (muted).
 */
export type VideoRole = 'main' | 'background';

export interface LayoutStageProps {
  layout: Layout;
  /** Width / height of the source video (podcast mode). */
  aspect: number;
  /** The clip's title (hook text), for a header with source 'title'. */
  title?: string | null;
  /** YouTube channel, for the credit. */
  channel?: string | null;
  /** URL of the background image (type 'image'), already resolved from `asset://`. */
  backgroundImageUrl?: string;
  renderVideo: (role: VideoRole, style: React.CSSProperties) => React.ReactNode;
  ImgComponent?: React.ComponentType<{ src: string; style?: React.CSSProperties }>;
  /** Fit of the video in full mode (the editor uses 'contain'). */
  fullFit?: 'cover' | 'contain';
}

const W = DESIGN_CANVAS.width;
const H = DESIGN_CANVAS.height;
/** Design px → cqw of the 9:16 box (100 cqw = its width). */
const cqw = (px: number) => `${r4((px / W) * 100)}cqw`;
const pctX = (px: number) => `${r4((px / W) * 100)}%`;
const pctY = (px: number) => `${r4((px / H) * 100)}%`;
/** The blurred background is drawn at this fraction of the canvas and scaled up (much cheaper). */
const BG_SCALE = 0.25;
/** Overscan of the blurred background, so its soft edges stay outside the canvas. */
const BG_OVERSCAN = 1.15;

export const LayoutStage: React.FC<LayoutStageProps> = ({
  layout,
  aspect,
  title,
  channel,
  backgroundImageUrl,
  renderVideo,
  ImgComponent,
  fullFit = 'cover',
}) => {
  if (layout.mode !== 'podcast') {
    return <>{renderVideo('main', { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fullFit })}</>;
  }

  const g = podcastGeometry(layout, aspect, title, channel);
  const bg = layout.background;
  const h = layout.header;
  const Img = ImgComponent;
  const cover: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
  const growth = BG_OVERSCAN / BG_SCALE;

  let background: React.ReactNode;
  if (bg.type === 'blur') {
    background = (
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `${BG_SCALE * 100}%`,
          height: `${BG_SCALE * 100}%`,
          transform: `translate(-50%, -50%) scale(${r4(growth)})`,
          // Blur applies before the scale: divide so the visible strength is `bg.blur` design px
          filter: bg.blur > 0 ? `blur(${cqw(bg.blur / growth)})` : undefined,
        }}
      >
        {renderVideo('background', { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' })}
      </div>
    );
  } else if (bg.type === 'image' && backgroundImageUrl) {
    background = Img ? (
      <Img src={backgroundImageUrl} style={cover} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={backgroundImageUrl} alt="" style={cover} />
    );
  }

  const fill =
    bg.type === 'gradient' ? `linear-gradient(180deg, ${bg.color} 0%, ${bg.color2} 100%)` : bg.color;

  const fontPx = (h.fontSize / 2) * g.scale;
  const justify = h.align === 'left' ? 'flex-start' : h.align === 'right' ? 'flex-end' : 'center';

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: fill }}>
        {background}
        {bg.dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${r4(bg.dim)})` }} />}
      </div>

      <div
        style={{
          position: 'absolute',
          left: pctX(g.frame.left),
          top: pctY(g.frame.top),
          width: pctX(g.frame.width),
          height: pctY(g.frame.height),
          overflow: 'hidden',
          borderRadius: layout.frame.radius > 0 ? cqw(layout.frame.radius) : undefined,
          background: '#000',
        }}
      >
        {renderVideo('main', {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${r4(layout.frame.focusX * 100)}% 50%`,
        })}
        {g.credit && (
          <div
            style={{
              position: 'absolute',
              right: cqw(6),
              bottom: cqw(5),
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              fontWeight: 600,
              fontSize: cqw(layout.credit.fontSize / 2),
              lineHeight: 1.2,
              color: layout.credit.color,
              padding: '0.2em 0.5em',
              borderRadius: '0.6em',
              background: 'rgba(0,0,0,0.45)',
              whiteSpace: 'nowrap',
              maxWidth: '90%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {g.credit}
          </div>
        )}
      </div>

      {g.header && (
        <div
          style={{
            position: 'absolute',
            left: pctX(g.header.left),
            width: pctX(g.header.width),
            bottom: pctY(H - g.header.top - g.header.height),
            display: 'flex',
            justifyContent: justify,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontFamily: `"${primaryFamily(h.fontFamily)}", sans-serif`,
              fontWeight: cssWeight(h.fontWeight, 800),
              fontSize: cqw(fontPx),
              lineHeight: HEADER_LINE_HEIGHT,
              color: h.color,
              textAlign: h.align,
              background: h.boxColor || undefined,
              padding: h.boxColor ? `${HEADER_PAD.y}em ${HEADER_PAD.x}em` : undefined,
              borderRadius: h.boxColor ? '0.35em' : undefined,
              textShadow: h.boxColor ? undefined : '0 0.05em 0.25em rgba(0,0,0,0.55)',
            }}
          >
            {g.lines.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'nowrap' }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
