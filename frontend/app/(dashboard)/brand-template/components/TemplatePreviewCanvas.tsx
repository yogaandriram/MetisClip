import React, { useState, useRef, useEffect } from 'react';
import { Play } from 'lucide-react';
import { Stage } from '@/components/ui';
import { assetUrl } from '@/lib/media';
import { CaptionLayer } from '@/lib/presets/CaptionLayer';
import { LOGO_BASE_SIZE, logoPosition, logoScale } from '@/lib/presets/BrandOverlay';
import type { CaptionWord } from '@/lib/presets/types';
import {
  ALL_PLATFORMS_UI,
  CENTER_X,
  DEFAULT_POSITION_Y,
  PLATFORM_UI,
  POSITION_LIMITS,
  captionCenterX,
  captionRect,
  toDesign,
} from '@/lib/presets/position';
import { AiSettings, CaptionSettings, BrandSettings, LayoutSettings, SafeZone, safeZoneLabel } from '../types';

interface TemplatePreviewCanvasProps {
  caption: CaptionSettings;
  ai: AiSettings;
  brandSettings?: BrandSettings;
  layoutSettings: LayoutSettings;
  onUpdateBrand?: (updates: Partial<BrandSettings>) => void;
  /** Caption dragged (or moved with the arrow keys) on the preview */
  onUpdateCaption?: (updates: Partial<CaptionSettings>) => void;
}

// Sample sentence for the preview loop. "eh" shows the filler-word setting; the marked words show
// the keyword highlight and emoji settings (in real clips the AI marks them, editable per word).
const SAMPLE_WORDS: CaptionWord[] = [
  { word: 'Rahasia', start: 0.0, end: 0.42 },
  { word: 'konten', start: 0.42, end: 0.8 },
  { word: 'viral', start: 0.8, end: 1.25, keyword: true, emoji: '🔥' },
  { word: 'eh', start: 1.3, end: 1.6 },
  { word: 'ternyata', start: 1.65, end: 2.1 },
  { word: 'sederhana', start: 2.1, end: 2.65, keyword: true },
  { word: 'banget!', start: 2.65, end: 3.15, emoji: '💡' },
];
const SAMPLE_LOOP = 4.3; // seconds, includes a short silence so the fade-out is visible

// Platform UI areas drawn over the preview (guides only)
const SAFE_ZONE_BAND: React.CSSProperties = {
  position: 'absolute',
  background: 'var(--ink-veil)',
  color: 'var(--on-ink)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '10px',
  pointerEvents: 'none',
};
const SAFE_AREA_OUTLINE: React.CSSProperties = {
  position: 'absolute',
  border: '1px dashed var(--leaf)',
  borderRadius: 'var(--r-xs)',
  pointerEvents: 'none',
};
const SNAP_LINE: React.CSSProperties = { position: 'absolute', background: 'var(--leaf)', zIndex: 10, pointerEvents: 'none' };
const CAPTION_SNAP = 6; // design px
const ALL_SAFE = toDesign(ALL_PLATFORMS_UI);

/**
 * Areas the chosen platform (or any platform, for 'all') covers with its own UI, from the same
 * figures as the caption safety check (lib/presets/position.ts). Drawn on the preview only.
 */
const SafeZoneGuide: React.FC<{ zone: SafeZone }> = ({ zone }) => {
  if (zone === 'none') return null;
  const z = zone === 'all' ? ALL_SAFE : toDesign(PLATFORM_UI[zone]);
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      <div style={{ ...SAFE_ZONE_BAND, left: 0, right: 0, top: 0, height: z.top }}>Tab & menu</div>
      <div style={{ ...SAFE_ZONE_BAND, left: 0, right: 0, bottom: 0, height: z.bottom }}>Judul & keterangan</div>
      <div style={{ ...SAFE_ZONE_BAND, right: 0, top: z.top, bottom: z.bottom, width: z.right, writingMode: 'vertical-rl' }}>Tombol</div>
      <div style={{ ...SAFE_ZONE_BAND, left: 0, top: z.top, bottom: z.bottom, width: z.left }} />
      <div style={{ ...SAFE_AREA_OUTLINE, left: z.left, right: z.right, top: z.top, bottom: z.bottom }} />
    </div>
  );
};

/** Seconds since mount, looping, on requestAnimationFrame (same time-based animation as the render). */
function useLoopClock(period: number): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setTime(((now - t0) / 1000) % period);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [period]);
  return time;
}

export const TemplatePreviewCanvas: React.FC<TemplatePreviewCanvasProps> = ({ caption, ai, brandSettings, layoutSettings, onUpdateBrand, onUpdateCaption }) => {
  // Brand assets are stored as asset://<path>; no remote sample video (the app must work offline)
  const videoUrl = assetUrl(brandSettings?.sampleVideoUrl);
  const overlaySrc = assetUrl(brandSettings?.overlayUrl);

  // Canvas bounds
  const CANVAS_WIDTH = 300;
  const CANVAS_HEIGHT = 533;
  const BASE_LOGO_SIZE = LOGO_BASE_SIZE; // logo width at scale 1 (same as the render)
  const currentLogoSize = BASE_LOGO_SIZE * logoScale(brandSettings);
  const SNAP_THRESHOLD = 15;

  // Dragging & Resizing State
  const initialPos = logoPosition(brandSettings);
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false });
  const containerRef = useRef<HTMLDivElement>(null);

  // Caption animation clock (the sample sentence loops)
  const clock = useLoopClock(SAMPLE_LOOP);

  // Caption dragging: the position follows the pointer locally and is saved on release
  const capStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [capDrag, setCapDrag] = useState<{ x: number; y: number } | null>(null);
  const [capSnap, setCapSnap] = useState({ x: false, y: false });
  const shownCaption: CaptionSettings = capDrag ? { ...caption, positionX: capDrag.x, positionY: capDrag.y } : caption;
  const capRect = captionRect(shownCaption, !!ai.emojis);
  const capHeight = capRect.top - capRect.bottom;

  const handleCaptionPointerDown = (e: React.PointerEvent) => {
    if (!onUpdateCaption) return;
    e.stopPropagation();
    const x = captionCenterX(caption);
    capStart.current = { px: e.clientX, py: e.clientY, x, y: caption.positionY };
    setCapDrag({ x, y: caption.positionY });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCaptionPointerMove = (e: React.PointerEvent) => {
    const start = capStart.current;
    if (!start || !containerRef.current) return;
    const scale = containerRef.current.getBoundingClientRect().width / CANVAS_WIDTH;
    let x = start.x + (e.clientX - start.px) / scale;
    let y = start.y - (e.clientY - start.py) / scale;
    x = Math.max(POSITION_LIMITS.x.min, Math.min(POSITION_LIMITS.x.max, x));
    y = Math.max(POSITION_LIMITS.y.min, Math.min(POSITION_LIMITS.y.max, CANVAS_HEIGHT - capHeight, y));
    // Snap to the center line and to the default height (the lowest spot that is safe everywhere)
    const snapX = Math.abs(x - CENTER_X) < CAPTION_SNAP;
    const snapY = Math.abs(y - DEFAULT_POSITION_Y) < CAPTION_SNAP;
    setCapSnap({ x: snapX, y: snapY });
    setCapDrag({ x: snapX ? CENTER_X : Math.round(x), y: snapY ? DEFAULT_POSITION_Y : Math.round(y) });
  };

  const handleCaptionPointerUp = (e: React.PointerEvent) => {
    const start = capStart.current;
    if (!start) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    capStart.current = null;
    if (capDrag && onUpdateCaption && (capDrag.x !== Math.round(start.x) || capDrag.y !== Math.round(start.y))) {
      onUpdateCaption({ positionX: capDrag.x, positionY: capDrag.y });
    }
    setCapDrag(null);
    setCapSnap({ x: false, y: false });
  };

  const handleCaptionKeyDown = (e: React.KeyboardEvent) => {
    if (!onUpdateCaption) return;
    const step = e.shiftKey ? 10 : 2;
    const x = captionCenterX(caption);
    const y = caption.positionY;
    const moves: Record<string, Partial<CaptionSettings>> = {
      ArrowUp: { positionY: Math.min(POSITION_LIMITS.y.max, y + step) },
      ArrowDown: { positionY: Math.max(POSITION_LIMITS.y.min, y - step) },
      ArrowLeft: { positionX: Math.max(POSITION_LIMITS.x.min, x - step) },
      ArrowRight: { positionX: Math.min(POSITION_LIMITS.x.max, x + step) },
    };
    if (moves[e.key]) {
      e.preventDefault();
      onUpdateCaption(moves[e.key]);
    }
  };

  // Sync state with props if it changes externally
  useEffect(() => {
    if (brandSettings?.logoPosition && !isDragging) {
      setPos(brandSettings.logoPosition);
    }
  }, [brandSettings?.logoPosition, isDragging]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const scale = rect.width / CANVAS_WIDTH;
    let newX = (e.clientX - rect.left) / scale - currentLogoSize / 2;
    let newY = (e.clientY - rect.top) / scale - currentLogoSize / 2;

    // Boundaries
    newX = Math.max(0, Math.min(newX, CANVAS_WIDTH - currentLogoSize));
    newY = Math.max(0, Math.min(newY, CANVAS_HEIGHT - currentLogoSize));

    // Snapping Logic
    const centerX = CANVAS_WIDTH / 2 - currentLogoSize / 2;
    const centerY = CANVAS_HEIGHT / 2 - currentLogoSize / 2;
    
    let snapX = false;
    let snapY = false;

    if (Math.abs(newX - centerX) < SNAP_THRESHOLD) {
      newX = centerX;
      snapX = true;
    }
    if (Math.abs(newY - centerY) < SNAP_THRESHOLD) {
      newY = centerY;
      snapY = true;
    }

    setSnapGuides({ x: snapX, y: snapY });
    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(false);
    setSnapGuides({ x: false, y: false });
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    if (onUpdateBrand) {
      onUpdateBrand({ logoPosition: pos });
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing || !containerRef.current) return;
    e.stopPropagation();
    
    const rect = containerRef.current.getBoundingClientRect();
    const scale = rect.width / CANVAS_WIDTH;
    
    const logoXOnScreen = rect.left + pos.x * scale;
    const logoYOnScreen = rect.top + pos.y * scale;
    
    const mouseDX = e.clientX - logoXOnScreen;
    const mouseDY = e.clientY - logoYOnScreen;
    
    const newPixelSize = Math.max(mouseDX, mouseDY) / scale;
    
    let newScale = newPixelSize / BASE_LOGO_SIZE;
    newScale = Math.max(0.5, Math.min(newScale, 4)); // constrain between 0.5x and 4x
    
    if (onUpdateBrand) {
      onUpdateBrand({ logoScale: newScale });
    }
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsResizing(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <Stage className="mc-stack">
      <div className="mc-row mc-row--between">
        <h2 className="mc-h3">Preview</h2>
        {layoutSettings.safeZone && layoutSettings.safeZone !== 'none' && (
          <span className="mc-caption mc-muted">Safe zone {safeZoneLabel(layoutSettings.safeZone)}</span>
        )}
      </div>

      {/* 9:16 preview at the design size the caption and logo positions refer to */}
      <div
        ref={containerRef}
        style={{
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
          background: 'var(--ink-soft)', containerType: 'inline-size',
          borderRadius: 'var(--r-md)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {videoUrl ? (
          <video
            src={videoUrl}
            autoPlay
            loop
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
          />
        ) : (
          <div className="mc-caption mc-muted" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 30px' }}>
            Unggah &quot;Video contoh&quot; di bagian Logo & video contoh untuk melihat preview di atas video Anda.
          </div>
        )}

        {/* Safe zone overlays (guides only, never rendered). While the caption is dragged, the
            area that is safe on every platform is always outlined. */}
        <SafeZoneGuide zone={layoutSettings.safeZone || 'none'} />
        {capDrag && layoutSettings.safeZone !== 'all' && (
          <div aria-hidden="true" style={{ ...SAFE_AREA_OUTLINE, left: ALL_SAFE.left, right: ALL_SAFE.right, top: ALL_SAFE.top, bottom: ALL_SAFE.bottom, zIndex: 6 }} />
        )}
        {capDrag && capSnap.x && <div aria-hidden="true" style={{ ...SNAP_LINE, left: '50%', top: 0, bottom: 0, width: '1px', transform: 'translateX(-50%)' }} />}
        {capDrag && capSnap.y && <div aria-hidden="true" style={{ ...SNAP_LINE, left: 0, right: 0, bottom: DEFAULT_POSITION_Y, height: '1px' }} />}

        {/* Snap Guides */}
        {isDragging && snapGuides.x && (
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'var(--leaf)', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none' }} />
        )}
        {isDragging && snapGuides.y && (
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--leaf)', transform: 'translateY(-50%)', zIndex: 10, pointerEvents: 'none' }} />
        )}

        {/* Overlay Image (Logo/CTA) */}
        {overlaySrc && (
          <div
            style={{
              position: 'absolute',
              top: `${pos.y}px`,
              left: `${pos.x}px`,
              width: `${currentLogoSize}px`,
              height: 'auto',
              zIndex: 20
            }}
          >
            <img
              src={overlaySrc}
              alt="Brand Overlay"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              draggable={false}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
                pointerEvents: 'auto',
                outline: (isDragging || isResizing) ? '1px solid var(--leaf)' : 'none'
              }}
            />
            <div
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: '-6px',
                bottom: '-6px',
                width: '14px',
                height: '14px',
                background: 'var(--leaf)',
                borderRadius: 'var(--r-full)',
                border: '2px solid var(--ink)',
                cursor: 'nwse-resize',
                touchAction: 'none',
                display: 'block',
                opacity: (isDragging || isResizing) ? 1 : 0.7,
                transition: 'opacity var(--dur-base) var(--ease-out)',
                pointerEvents: 'auto'
              }}
            />
          </div>
        )}

        {/* Caption: the same component and sizing as the clip editor and the exported video */}
        <CaptionLayer words={SAMPLE_WORDS} time={clock} style={{ ...shownCaption, offsetTime: 0 }} ai={ai} />
        {onUpdateCaption && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Posisi caption. Geser untuk memindahkan, atau pakai tombol panah (Shift untuk langkah besar)."
            className={capDrag ? 'mc-drag-target is-dragging' : 'mc-drag-target'}
            onPointerDown={handleCaptionPointerDown}
            onPointerMove={handleCaptionPointerMove}
            onPointerUp={handleCaptionPointerUp}
            onPointerCancel={handleCaptionPointerUp}
            onKeyDown={handleCaptionKeyDown}
            style={{ left: capRect.left, width: capRect.right - capRect.left, bottom: capRect.bottom, height: capHeight, zIndex: 15 }}
          />
        )}

        {/* Mock player bar */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '12px', right: '12px', bottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--on-ink)', pointerEvents: 'none' }}>
          <Play size={12} fill="currentColor" strokeWidth={0} />
          <div style={{ flex: 1, height: '4px', background: 'var(--ink-glass)', borderRadius: 'var(--r-full)', overflow: 'hidden' }}>
            <div style={{ width: `${(clock / SAMPLE_LOOP) * 100}%`, height: '100%', background: 'var(--leaf)' }} />
          </div>
        </div>
      </div>

      <p className="mc-caption mc-muted" style={{ maxWidth: `${CANVAS_WIDTH}px` }}>
        Geser caption untuk memindahkannya.
        {overlaySrc && ' Geser logo untuk memindahkan, tarik titik di sudutnya untuk mengubah ukuran.'}
      </p>
    </Stage>
  );
};
