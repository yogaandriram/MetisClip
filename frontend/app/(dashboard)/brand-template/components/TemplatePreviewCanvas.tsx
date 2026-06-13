import React, { useState, useRef, useEffect, useCallback } from 'react';
import { presets } from '@/lib/presets';
import { CaptionSettings, BrandSettings, LayoutSettings } from '../types';

interface TemplatePreviewCanvasProps {
  caption: CaptionSettings;
  aiEmojis: boolean;
  brandSettings?: BrandSettings;
  layoutSettings: LayoutSettings;
  onUpdateBrand?: (updates: Partial<BrandSettings>) => void;
}

export const TemplatePreviewCanvas: React.FC<TemplatePreviewCanvasProps> = ({ caption, aiEmojis, brandSettings, layoutSettings, onUpdateBrand }) => {
  const defaultVideoUrl = "https://www.w3schools.com/html/mov_bbb.mp4";
  const videoUrl = brandSettings?.sampleVideoUrl || defaultVideoUrl;

  // Canvas bounds
  const CANVAS_WIDTH = 300;
  const CANVAS_HEIGHT = 533;
  const BASE_LOGO_SIZE = 60; // Max width/height of the logo base
  const currentLogoSize = BASE_LOGO_SIZE * (brandSettings?.logoScale || 1);
  const SNAP_THRESHOLD = 15;

  // Dragging & Resizing State
  const initialPos = brandSettings?.logoPosition || { x: CANVAS_WIDTH - currentLogoSize - 15, y: 15 };
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false });
  const containerRef = useRef<HTMLDivElement>(null);

  // Animation State
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const previewWords = [
    { word: 'PREMIUM', start: 0, end: 1 },
    { word: 'CAPTIONS', start: 1, end: 2 },
    { word: 'FOR', start: 2, end: 3 },
    { word: 'VIRAL', start: 3, end: 4 },
    { word: 'VIDEOS', start: 4, end: 5 }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveWordIndex((prev) => (prev + 1) % previewWords.length);
    }, 800);
    return () => clearInterval(interval);
  }, [previewWords.length]);

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
    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', position: 'relative' }}>
      {/* Mock Mobile Screen */}
      <div 
        ref={containerRef}
        style={{ 
          width: `${CANVAS_WIDTH}px`, 
          height: `${CANVAS_HEIGHT}px`, 
          background: '#1A1A2E', 
          borderRadius: '16px', 
          position: 'relative', 
          overflow: 'hidden', 
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          border: '1px solid var(--border-glass)'
        }}
      >
        <video 
          src={videoUrl}
          autoPlay 
          loop 
          muted 
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
        />
        
        {/* Safe Zone Overlays */}
        {layoutSettings.safeZone === 'tiktok' && (
          <>
            <div style={{ position: 'absolute', right: '10px', bottom: '150px', width: '40px', height: '200px', background: 'rgba(255,0,0,0.2)', border: '1px dashed red', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'red', writingMode: 'vertical-rl', pointerEvents: 'none' }}>TikTok UI</div>
            <div style={{ position: 'absolute', left: '10px', bottom: '20px', width: '200px', height: '80px', background: 'rgba(255,0,0,0.2)', border: '1px dashed red', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'red', pointerEvents: 'none' }}>Caption & Sound</div>
          </>
        )}
        {layoutSettings.safeZone === 'reels' && (
          <>
            <div style={{ position: 'absolute', right: '10px', bottom: '120px', width: '40px', height: '200px', background: 'rgba(255,0,255,0.2)', border: '1px dashed #f0f', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#f0f', writingMode: 'vertical-rl', pointerEvents: 'none' }}>Reels UI</div>
            <div style={{ position: 'absolute', left: '10px', bottom: '20px', width: '200px', height: '80px', background: 'rgba(255,0,255,0.2)', border: '1px dashed #f0f', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#f0f', pointerEvents: 'none' }}>Caption & Audio</div>
          </>
        )}
        {layoutSettings.safeZone === 'shorts' && (
          <>
            <div style={{ position: 'absolute', right: '10px', bottom: '80px', width: '40px', height: '240px', background: 'rgba(255,0,0,0.2)', border: '1px dashed red', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'red', writingMode: 'vertical-rl', pointerEvents: 'none' }}>Shorts UI</div>
            <div style={{ position: 'absolute', left: '10px', bottom: '20px', width: '220px', height: '60px', background: 'rgba(255,0,0,0.2)', border: '1px dashed red', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'red', pointerEvents: 'none' }}>Channel & Title</div>
          </>
        )}

        {/* Snap Guides */}
        {isDragging && snapGuides.x && (
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'var(--primary)', borderLeft: '1px dashed var(--primary)', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none' }} />
        )}
        {isDragging && snapGuides.y && (
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--primary)', borderTop: '1px dashed var(--primary)', transform: 'translateY(-50%)', zIndex: 10, pointerEvents: 'none' }} />
        )}

        {/* Overlay Image (Logo/CTA) */}
        {brandSettings?.overlayUrl && (
          <div
            style={{
              position: 'absolute',
              top: `${pos.y}px`,
              left: `${pos.x}px`,
              width: `${currentLogoSize}px`,
              height: `${currentLogoSize}px`,
              zIndex: 20
            }}
          >
            <img 
              src={brandSettings.overlayUrl} 
              alt="Brand Overlay"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              draggable={false}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain',
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
                pointerEvents: 'auto',
                border: (isDragging || isResizing) ? '1px dashed rgba(255,255,255,0.5)' : 'none'
              }}
            />
            <div
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              style={{
                position: 'absolute',
                right: '-6px',
                bottom: '-6px',
                width: '14px',
                height: '14px',
                background: 'var(--primary)',
                borderRadius: '50%',
                border: '2px solid white',
                cursor: 'nwse-resize',
                touchAction: 'none',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                display: 'block',
                opacity: (isDragging || isResizing) ? 1 : 0.7,
                transition: 'opacity 0.2s',
                pointerEvents: 'auto'
              }}
            />
          </div>
        )}

        {/* Mock Caption */}
        <div style={{ position: 'absolute', bottom: `${caption.positionY || 80}px`, left: '50%', transform: 'translateX(-50%)', width: '70%', textAlign: 'center' }}>
          <div style={{ 
            fontSize: `${caption.fontSize * 0.5}px`, 
            lineHeight: 1.2,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px'
          }}>
            {(() => {
              const activePreset = presets.find(p => p.id === caption.mode);
              if (!activePreset) return null;
              
              const isHighlightStyle = true; // Assuming future premium presets will be highlight-based
              
              return activePreset.renderPreview({
                words: previewWords,
                activeWordIndex: activeWordIndex,
                config: caption
              });
            })()}
          </div>
          {aiEmojis && <div style={{ fontSize: '30px', marginTop: '10px' }}>🥰</div>}
        </div>

        {/* Mock Timeline */}
        <div style={{ position: 'absolute', bottom: '15px', width: '90%', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px' }}>
          <div style={{ width: '30%', height: '100%', background: 'var(--primary)', borderRadius: '2px' }} />
        </div>
        <div style={{ position: 'absolute', bottom: '10px', left: '15px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>
  );
};
