import React, { useEffect, useState } from 'react';
import { Check, ZoomIn } from 'lucide-react';
import { LayoutStage } from '@/lib/presets/LayoutStage';
import { type Layout, LAYOUT_PRESETS, type LayoutPreset, applyLayoutPreset, matchingPreset, sampleScenes } from '@/lib/presets/layout';
import { SAMPLE_TITLE } from '../types';

/** A stand-in for the video in the thumbnails: a person on a green backdrop. */
const PERSON: React.CSSProperties = {
  background: [
    'radial-gradient(circle at 50% 40%, var(--sage) 0 11%, transparent 11.5%)',
    'radial-gradient(ellipse 34% 26% at 50% 86%, var(--sage) 0 99%, transparent 100%)',
    'linear-gradient(165deg, var(--leaf-strong) 0%, var(--moss) 100%)',
  ].join(', '),
};

/** A stand-in for the companion video (split layout): diagonal stripes, so it reads as other footage. */
const COMPANION: React.CSSProperties = {
  background: 'repeating-linear-gradient(135deg, var(--moss) 0 9%, var(--leaf-strong) 9% 18%)',
};

/**
 * A stand-in for a source picture with two people side by side (duo layout): heads at a third and two
 * thirds, where sampleScenes puts the faces.
 */
export const DUO_PLACEHOLDER: React.CSSProperties = {
  background: [
    'radial-gradient(circle at 30% 42%, var(--sage) 0 6.5%, transparent 7%)',
    'radial-gradient(circle at 70% 42%, var(--sage) 0 6.5%, transparent 7%)',
    'radial-gradient(ellipse 12% 24% at 30% 96%, var(--sage) 0 99%, transparent 100%)',
    'radial-gradient(ellipse 12% 24% at 70% 96%, var(--sage) 0 99%, transparent 100%)',
    'linear-gradient(165deg, var(--leaf-strong) 0%, var(--moss) 100%)',
  ].join(', '),
};

/** A stand-in for a picture without a face (auto layout's framed scenes): a slide with a title and lines. */
export const SLIDE_PLACEHOLDER: React.CSSProperties = {
  background: [
    'linear-gradient(var(--moss), var(--moss)) 12% 22% / 52% 9% no-repeat',
    'linear-gradient(var(--leaf-strong), var(--leaf-strong)) 12% 48% / 72% 6% no-repeat',
    'linear-gradient(var(--leaf-strong), var(--leaf-strong)) 12% 64% / 62% 6% no-repeat',
    'linear-gradient(var(--leaf-strong), var(--leaf-strong)) 12% 80% / 50% 6% no-repeat',
    'var(--surface)',
  ].join(', '),
};

/** Seconds per sample scene in the auto thumbnail (two people, one person, a slide). */
const AUTO_STEP = 1.45;

/**
 * The auto thumbnail steps through its sample scenes, so it shows that the view changes per scene.
 * Static (the two-people scene) when the user prefers reduced motion.
 */
function useSceneCycle(enabled: boolean): number {
  const [t, setT] = useState(AUTO_STEP / 2);
  useEffect(() => {
    if (!enabled) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setT((v) => (v + AUTO_STEP) % (AUTO_STEP * 3)), 1600);
    return () => window.clearInterval(id);
  }, [enabled]);
  return t;
}

/** Thumbnails show the account row filled in, like a real card. */
const SAMPLE_ACCOUNT = { name: 'Nama Akun', handle: '@namaakun' };

interface Props {
  layout: Layout;
  onApply: (layout: Layout) => void;
}

/**
 * Ready-made layouts. Each thumbnail is the real layout component with a placeholder video, so it
 * looks like the result. Picking one keeps the account, the custom title, the credit, the background
 * image, the speaker tag and the companion video.
 */
export const LayoutPresetGallery: React.FC<Props> = ({ layout, onApply }) => {
  const active = matchingPreset(layout);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 'var(--s-4)' }}>
      {LAYOUT_PRESETS.map((p) => (
        <PresetTile key={p.id} preset={p} layout={layout} selected={active?.id === p.id} onApply={onApply} />
      ))}
    </div>
  );
};

const PresetTile: React.FC<{ preset: LayoutPreset; layout: Layout; selected: boolean; onApply: (l: Layout) => void }> = ({
  preset,
  layout,
  selected,
  onApply,
}) => {
  const result = applyLayoutPreset(layout, preset);
  const auto = result.mode === 'auto';
  const time = useSceneCycle(auto);
  const shown: Layout = {
    ...result,
    card: { ...result.card, name: result.card.name || SAMPLE_ACCOUNT.name, handle: result.card.handle || SAMPLE_ACCOUNT.handle },
    speaker: { ...result.speaker, enabled: false },
  };
  return (
    <div className="mc-stack mc-gap-8">
      <button
        type="button"
        className="mc-thumb"
        aria-pressed={selected}
        aria-label={`${preset.name}: ${preset.description}`}
        title={preset.description}
        onClick={() => onApply(result)}
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '9 / 16',
          padding: 0,
          border: 0,
          cursor: 'pointer',
          containerType: 'inline-size',
          boxShadow: selected ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : undefined,
        }}
      >
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <LayoutStage
            layout={shown}
            aspect={16 / 9}
            title={SAMPLE_TITLE}
            channel="Channel contoh"
            scenes={sampleScenes(result.mode, AUTO_STEP)}
            time={auto ? time : 0}
            renderVideo={(role, style) => (
              <span
                style={{
                  ...style,
                  ...(role === 'companion'
                    ? COMPANION
                    : role === 'duoTop' || role === 'duoBottom'
                      ? DUO_PLACEHOLDER
                      : role === 'framed' || (auto && role === 'background')
                        ? SLIDE_PLACEHOLDER
                        : PERSON),
                  display: 'block',
                }}
              />
            )}
          />
        </span>
        {result.zoom.enabled && (
          <span className="mc-thumb__corner mc-thumb__corner--tr mc-overlay-glass" style={{ borderRadius: 'var(--r-full)', padding: 4, display: 'flex' }}>
            <ZoomIn size={12} aria-hidden="true" />
          </span>
        )}
      </button>
      <span className={selected ? 'mc-row mc-gap-4 mc-caption' : 'mc-row mc-gap-4 mc-caption mc-muted'}>
        {selected && <Check size={14} aria-hidden="true" />}
        {preset.name}
        {selected && <span className="mc-sr-only">(dipilih)</span>}
      </span>
    </div>
  );
};
