import React, { useMemo } from 'react';
import { DESIGN_CANVAS } from './position';
import { r4 } from './anim';
import { cssWeight, primaryFamily } from './style';
import type { CaptionWord } from './types';
import {
  CARD,
  HEADER_LINE_HEIGHT,
  HEADER_PAD,
  SPEAKER_ROLE_SCALE,
  SPEAKER_SIDE,
  type DuoFace,
  type Layout,
  type LayoutSpeaker,
  type Rect,
  type SceneData,
  type SpeakerFrame,
  cardGeometry,
  creditText,
  duoCrop,
  duoFaces,
  duoGeometry,
  podcastGeometry,
  sceneAt,
  scenePlan,
  splitGeometry,
  speakerAt,
  zoomAt,
  zoomRanges,
} from './layout';

/**
 * The video layer of the 9:16 canvas, laid out by the Brand Template layout (lib/presets/layout.ts).
 * Used unchanged by the clip editor, the Brand Template preview and the Remotion render; the logo and
 * the caption go on top of it (the caller renders them after this).
 *
 * The parent must be the 9:16 box with `container-type: inline-size` (sizes are in `cqw`).
 * `renderVideo` draws the video element for each role with the given style: 'main' is the clip
 * (full, split) or the framed source (podcast, card), 'background' the blurred copy behind it
 * (muted), 'companion' the looping companion video of the split mode (muted; the caller loops it
 * from the clip's start point, see companionStart), 'duoTop' and 'duoBottom' the two panels of the
 * duo and auto modes (source.mp4, muted), 'framed' the source in the podcast frame of the auto mode
 * (source.mp4, muted; 'main' stays the face-tracked clip there).
 * `hidden`: the element is not on screen at this time (duo and auto modes: the views of the other
 * scenes). The editor keeps such a video playing out of sight (the main one carries the sound); the
 * render can leave it out of the frame.
 * `time` and `words` drive the dynamic zoom, the speaker tag and the scenes (pure functions of time).
 */
export type VideoRole = 'main' | 'background' | 'companion' | 'duoTop' | 'duoBottom' | 'framed';

export interface LayoutStageProps {
  layout: Layout;
  /** Width / height of the source video (podcast and card modes). */
  aspect: number;
  /** The clip's title (hook text), for a header with source 'title'. */
  title?: string | null;
  /** YouTube channel, for the credit. */
  channel?: string | null;
  /** URL of the background image (type 'image'), already resolved from `asset://`. */
  backgroundImageUrl?: string;
  /** URL of the card avatar, already resolved from `asset://`. */
  avatarUrl?: string;
  renderVideo: (role: VideoRole, style: React.CSSProperties, hidden?: boolean) => React.ReactNode;
  ImgComponent?: React.ComponentType<{ src: string; style?: React.CSSProperties }>;
  /** Fit of the video in full mode (the editor uses 'contain'). */
  fullFit?: 'cover' | 'contain';
  /** Playback time of the source video (seconds). */
  time?: number;
  /** Subtitle words (AI keywords and sentences drive the zoom). */
  words?: CaptionWord[];
  /** Caption sync offset in ms (a word is heard at start + offset), like the caption style's. */
  offsetMs?: number;
  /** The clip's shots from its face scan (duo and auto modes); without them the clip shows full-frame. */
  scenes?: SceneData | null;
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
const COVER: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
const fontStack = (family: string) => `"${primaryFamily(family)}", sans-serif`;

export const LayoutStage: React.FC<LayoutStageProps> = (props) => {
  const { layout, words, time = 0, offsetMs = 0, renderVideo } = props;
  const zoom = layout.zoom;
  const ranges = useMemo(() => (zoom.enabled ? zoomRanges(words, zoom.style) : []), [words, zoom.enabled, zoom.style]);
  const scale = zoomAt(zoom, ranges, time - offsetMs / 1000);
  const speaker = speakerAt(layout.speaker, time);
  /** Zoom of the main video, around a point a little above the middle (where faces usually are). */
  const zoomed = (originX: number): React.CSSProperties =>
    scale > 1.0001 ? { transform: `scale(${r4(scale)})`, transformOrigin: `${r4(originX * 100)}% 40%` } : {};

  let body: React.ReactNode;
  if (layout.mode === 'podcast') body = <PodcastBody {...props} zoomStyle={zoomed(layout.frame.focusX)} />;
  else if (layout.mode === 'card') body = <CardBody {...props} zoomStyle={zoomed(layout.frame.focusX)} />;
  else if (layout.mode === 'split') body = <SplitBody {...props} zoomStyle={zoomed(0.5)} />;
  else if (layout.mode === 'duo' || layout.mode === 'auto')
    body = <ScenesBody {...props} zoomStyle={zoomed(0.5)} frameZoomStyle={zoomed(layout.frame.focusX)} />;
  else body = renderVideo('main', { ...COVER, objectFit: props.fullFit || 'cover', ...zoomed(0.5) });

  return (
    <>
      {body}
      {speaker && <SpeakerTag sp={layout.speaker} f={speaker} />}
    </>
  );
};

type BodyProps = LayoutStageProps & { zoomStyle: React.CSSProperties };

/** Background of the podcast and card modes: blurred video, image, color or gradient, then the dim. */
const Backdrop: React.FC<BodyProps> = ({ layout, backgroundImageUrl, renderVideo, ImgComponent }) => {
  const bg = layout.background;
  const growth = BG_OVERSCAN / BG_SCALE;
  let content: React.ReactNode = null;
  if (bg.type === 'blur') {
    content = (
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
        {renderVideo('background', COVER)}
      </div>
    );
  } else if (bg.type === 'image' && backgroundImageUrl) {
    content = ImgComponent ? (
      <ImgComponent src={backgroundImageUrl} style={COVER} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={backgroundImageUrl} alt="" style={COVER} />
    );
  }
  const fill = bg.type === 'gradient' ? `linear-gradient(180deg, ${bg.color} 0%, ${bg.color2} 100%)` : bg.color;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: fill }}>
      {content}
      {bg.dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${r4(bg.dim)})` }} />}
    </div>
  );
};

/**
 * The source video in its frame: cropped to the frame ratio around focusX, zoomed, with the credit
 * (bottom corner; top corner in a card, whose bottom edge sits next to the default caption).
 */
const FramedVideo: React.FC<BodyProps & { credit: string; creditTop?: boolean }> = ({
  layout,
  renderVideo,
  zoomStyle,
  credit,
  creditTop,
}) => (
  <>
    {renderVideo('main', {
      ...COVER,
      objectPosition: `${r4(layout.frame.focusX * 100)}% 50%`,
      ...zoomStyle,
    })}
    {credit && <CreditBadge layout={layout} text={credit} top={creditTop} />}
  </>
);

/** "Sumber: {channel}" in the right corner of its box (top or bottom). */
const CreditBadge: React.FC<{ layout: Layout; text: string; top?: boolean }> = ({ layout, text, top }) => (
  <div
    style={{
      position: 'absolute',
      right: cqw(6),
      ...(top ? { top: cqw(5) } : { bottom: cqw(5) }),
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
    {text}
  </div>
);

const PodcastBody: React.FC<BodyProps> = (props) => {
  const { layout, aspect, title, channel } = props;
  const g = podcastGeometry(layout, aspect, title, channel);
  const h = layout.header;
  const fontPx = (h.fontSize / 2) * g.scale;
  const justify = h.align === 'left' ? 'flex-start' : h.align === 'right' ? 'flex-end' : 'center';

  return (
    <>
      <Backdrop {...props} />

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
        <FramedVideo {...props} credit={g.credit} />
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
              fontFamily: fontStack(h.fontFamily),
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

const ELLIPSIS: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/** Social-post card: avatar, name and handle, the post text (the title), then the video. */
const CardBody: React.FC<BodyProps> = (props) => {
  const { layout, aspect, title, channel, avatarUrl, ImgComponent } = props;
  const g = cardGeometry(layout, aspect, title, channel);
  const c = layout.card;
  const h = layout.header;
  const family = fontStack(h.fontFamily);
  const fontPx = (h.fontSize / 2) * g.scale;
  const initial = (Array.from(c.name.trim() || c.handle.replace(/^@/, '').trim())[0] || '').toUpperCase();
  const abs = (r: { left: number; top: number; width: number; height: number }): React.CSSProperties => ({
    position: 'absolute',
    left: cqw(r.left),
    top: cqw(r.top),
    width: cqw(r.width),
    height: cqw(r.height),
  });

  return (
    <>
      <Backdrop {...props} />

      <div
        style={{
          position: 'absolute',
          left: pctX(g.card.left),
          top: pctY(g.card.top),
          width: pctX(g.card.width),
          height: pctY(g.card.height),
          background: c.color,
          borderRadius: c.radius > 0 ? cqw(c.radius) : undefined,
          boxShadow: `0 ${cqw(2)} ${cqw(10)} rgba(0,0,0,0.28)`,
          overflow: 'hidden',
        }}
      >
        {g.row && (
          <>
            <div
              style={{
                ...abs({ left: g.row.left, top: g.row.top, width: CARD.avatar, height: CARD.avatar }),
                borderRadius: '50%',
                overflow: 'hidden',
                background: c.mutedColor,
                color: c.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: family,
                fontWeight: 700,
                fontSize: cqw(CARD.avatar * 0.45),
                lineHeight: 1,
              }}
            >
              {avatarUrl ? (
                ImgComponent ? (
                  <ImgComponent src={avatarUrl} style={COVER} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" style={COVER} />
                )
              ) : (
                initial
              )}
            </div>
            <div
              style={{
                ...abs({
                  left: g.row.left + CARD.avatar + CARD.nameGap,
                  top: g.row.top,
                  width: g.row.width - CARD.avatar - CARD.nameGap,
                  height: g.row.height,
                }),
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                fontFamily: family,
                lineHeight: 1.25,
              }}
            >
              {c.name.trim() && (
                <div style={{ ...ELLIPSIS, fontWeight: 700, fontSize: cqw(CARD.nameSize), color: c.textColor }}>{c.name.trim()}</div>
              )}
              {c.handle.trim() && (
                <div style={{ ...ELLIPSIS, fontWeight: 400, fontSize: cqw(CARD.handleSize), color: c.mutedColor }}>{c.handle.trim()}</div>
              )}
            </div>
          </>
        )}

        {g.text && (
          <div
            style={{
              ...abs(g.text),
              fontFamily: family,
              fontWeight: cssWeight(h.fontWeight, 500),
              fontSize: cqw(fontPx),
              lineHeight: CARD.lineHeight,
              color: c.textColor,
              textAlign: h.align,
            }}
          >
            {g.lines.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'nowrap' }}>
                {line}
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            ...abs(g.video),
            overflow: 'hidden',
            borderRadius: layout.frame.radius > 0 ? cqw(layout.frame.radius) : undefined,
            background: '#000',
          }}
        >
          <FramedVideo {...props} credit={g.credit} creditTop />
        </div>
      </div>
    </>
  );
};

/**
 * Split screen: the face-tracked clip in the speaker part (cropped around focusY), the companion
 * video in the other part. The credit sits in the speaker part's corner next to the seam, where no
 * platform UI covers it.
 */
const SplitBody: React.FC<BodyProps> = (props) => {
  const { layout, renderVideo, zoomStyle, channel } = props;
  const g = splitGeometry(layout);
  const credit = creditText(layout, channel);
  const speakerOnTop = layout.companion.position === 'bottom';
  const part = (r: { top: number; height: number }): React.CSSProperties => ({
    position: 'absolute',
    left: 0,
    width: '100%',
    top: pctY(r.top),
    height: pctY(r.height),
    overflow: 'hidden',
    background: '#000',
  });
  return (
    <>
      <div style={part(g.speaker)}>
        {renderVideo('main', { ...COVER, objectPosition: `50% ${r4(layout.companion.focusY * 100)}%`, ...zoomStyle })}
        {credit && <CreditBadge layout={layout} text={credit} top={!speakerOnTop} />}
      </div>
      <div style={part(g.companion)}>{renderVideo('companion', COVER)}</div>
      {g.divider && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: '100%',
            top: pctY(g.divider.top),
            height: pctY(g.divider.height),
            background: layout.companion.dividerColor,
          }}
        />
      )}
    </>
  );
};

const pct = (v: number, of: number) => `${r4((v / of) * 100)}%`;

/**
 * Duo and auto modes: the view of the scene at this time (scenePlan). 'full': the face-tracked clip
 * full-frame; 'duo': one panel per speaker (source.mp4 cropped around their face); 'framed': the
 * podcast frame with its background and title (auto mode). Only the views the clip's plan uses are
 * mounted; the others stay mounted but hidden, so the editor's videos keep playing in sync. The credit
 * sits in the top panel's corner next to the seam (the frame's own corner in a framed scene).
 */
const ScenesBody: React.FC<BodyProps & { frameZoomStyle: React.CSSProperties }> = (props) => {
  const { layout, renderVideo, zoomStyle, frameZoomStyle, channel, scenes, time = 0, fullFit } = props;
  const plan = scenePlan(scenes, layout);
  const scene = sceneAt(plan, time);
  const view = scene?.view || 'full';
  const hasDuo = plan.some((p) => p.view === 'duo');
  const hasFramed = plan.some((p) => p.view === 'framed');
  const g = duoGeometry(layout);
  const credit = creditText(layout, channel);
  const source = { width: scenes?.width || 1920, height: scenes?.height || 1080 };
  const faces = view === 'duo' && scene ? duoFaces(layout, scene.faces) : null;
  const box = (r: Rect, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: 0,
    width: '100%',
    top: pctY(r.top),
    height: pctY(r.height),
    ...extra,
  });
  const hide = (shown: boolean): React.CSSProperties => (shown ? {} : { visibility: 'hidden' });
  const panel = (role: 'duoTop' | 'duoBottom', r: Rect, face: DuoFace | null) => {
    const c = face ? duoCrop(face, r, source, layout.duo.faceSize) : { left: 0, top: 0, width: r.width, height: r.height };
    return (
      <div style={box(r, { overflow: 'hidden', background: '#000', ...hide(view === 'duo') })}>
        <div style={{ position: 'absolute', inset: 0, ...zoomStyle }}>
          {renderVideo(
            role,
            {
              position: 'absolute',
              left: pct(c.left, r.width),
              top: pct(c.top, r.height),
              width: pct(c.width, r.width),
              height: pct(c.height, r.height),
              maxWidth: 'none',
              objectFit: 'cover',
            },
            view !== 'duo',
          )}
        </div>
      </div>
    );
  };
  return (
    <>
      {renderVideo('main', { ...COVER, objectFit: fullFit || 'cover', ...zoomStyle, ...hide(view === 'full') }, view !== 'full')}
      {hasFramed && (
        <div style={{ position: 'absolute', inset: 0, ...hide(view === 'framed') }}>
          <PodcastBody
            {...props}
            zoomStyle={frameZoomStyle}
            // The frame shows source.mp4 ('framed'); 'main' stays the face-tracked clip
            renderVideo={(role, style, hidden) => renderVideo(role === 'main' ? 'framed' : role, style, hidden || view !== 'framed')}
          />
        </div>
      )}
      {hasDuo && panel('duoTop', g.top, faces ? faces[0] : null)}
      {hasDuo && panel('duoBottom', g.bottom, faces ? faces[1] : null)}
      {view === 'duo' && g.divider && <div style={box(g.divider, { background: layout.duo.dividerColor })} />}
      {credit && view !== 'framed' && (
        <div style={box(g.top, { pointerEvents: 'none' })}>
          <CreditBadge layout={layout} text={credit} />
        </div>
      )}
    </>
  );
};

/** Speaker name tag: a name box and an optional role box, wiped in from the left, faded out. */
const SpeakerTag: React.FC<{ sp: LayoutSpeaker; f: SpeakerFrame }> = ({ sp, f }) => {
  const left = sp.align === 'left';
  const fontPx = sp.fontSize / 2;
  const wipe = (p: number) => (left ? `inset(0 ${r4((1 - p) * 100)}% 0 0)` : `inset(0 ${r4((1 - p) * 50)}% 0 ${r4((1 - p) * 50)}%)`);
  const box: React.CSSProperties = {
    ...ELLIPSIS,
    maxWidth: '100%',
    lineHeight: 1.2,
    padding: '0.3em 0.55em',
    borderRadius: '0.25em',
    fontFamily: fontStack(sp.fontFamily),
  };
  return (
    <div
      style={{
        position: 'absolute',
        top: pctY(sp.y),
        left: pctX(SPEAKER_SIDE),
        width: pctX(W - 2 * SPEAKER_SIDE),
        display: 'flex',
        flexDirection: 'column',
        alignItems: left ? 'flex-start' : 'center',
        gap: cqw(2),
        opacity: r4(f.opacity),
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      <div
        style={{
          ...box,
          fontWeight: 800,
          fontSize: cqw(fontPx),
          background: sp.color,
          color: sp.textColor,
          clipPath: f.name < 1 ? wipe(f.name) : undefined,
        }}
      >
        {sp.name.trim()}
      </div>
      {sp.role.trim() && (
        <div
          style={{
            ...box,
            fontWeight: 600,
            fontSize: cqw(fontPx * SPEAKER_ROLE_SCALE),
            background: sp.accent,
            color: sp.accentText,
            clipPath: f.role < 1 ? wipe(f.role) : undefined,
          }}
        >
          {sp.role.trim()}
        </div>
      )}
    </div>
  );
};
