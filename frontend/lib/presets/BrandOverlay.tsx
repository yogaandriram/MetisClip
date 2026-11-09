import React from 'react';
import { DESIGN_CANVAS } from './defaults';
import { r4 } from './anim';

/** Base logo width on the 300×533 design canvas, before `logoScale`. */
export const LOGO_BASE_SIZE = 60;
const LOGO_MARGIN = 15;

export interface LogoSettings {
  logoPosition?: { x: number; y: number } | null;
  logoScale?: number | null;
}

export function logoScale(brand: LogoSettings | null | undefined): number {
  const s = Number(brand?.logoScale);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/** Logo top-left in design px. Default: top-right corner (same as the Brand Template canvas). */
export function logoPosition(brand: LogoSettings | null | undefined): { x: number; y: number } {
  const p = brand?.logoPosition;
  if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) return { x: Number(p.x), y: Number(p.y) };
  return { x: DESIGN_CANVAS.width - LOGO_BASE_SIZE * logoScale(brand) - LOGO_MARGIN, y: LOGO_MARGIN };
}

/**
 * Brand logo / CTA overlay, positioned in % of the 9:16 box so the editor and the render match.
 * `ImgComponent` lets Remotion pass its <Img> (waits for the image before the frame is captured).
 */
export const LogoOverlay: React.FC<{
  src: string;
  brand: LogoSettings | null | undefined;
  ImgComponent?: React.ComponentType<{ src: string; style?: React.CSSProperties }>;
  zIndex?: number;
}> = ({ src, brand, ImgComponent, zIndex = 5 }) => {
  if (!src) return null;
  const pos = logoPosition(brand);
  const width = LOGO_BASE_SIZE * logoScale(brand);
  const imgStyle: React.CSSProperties = { width: '100%', height: 'auto', display: 'block' };
  return (
    <div
      style={{
        position: 'absolute',
        top: `${r4((pos.y / DESIGN_CANVAS.height) * 100)}%`,
        left: `${r4((pos.x / DESIGN_CANVAS.width) * 100)}%`,
        width: `${r4((width / DESIGN_CANVAS.width) * 100)}%`,
        zIndex,
        pointerEvents: 'none',
      }}
    >
      {ImgComponent ? (
        <ImgComponent src={src} style={imgStyle} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={imgStyle} />
      )}
    </div>
  );
};
