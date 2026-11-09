// Frame-based animation helpers shared by the editor preview and the Remotion render.
// Everything is a pure function of time (seconds): the same timestamp always produces the same
// frame in the editor, in the Brand Template preview and in the exported video (preview == render).

export type EasingFn = (x: number) => number;

export const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

/** CSS `cubic-bezier(x1, y1, x2, y2)` as an easing function (same curves as the old CSS keyframes). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveT = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveT(x)));
}

export const Ease = {
  linear: ((x: number) => x) as EasingFn,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
  /** cubic-bezier(0.175, 0.885, 0.32, 1.275): the springy "back out" most presets used. */
  backOut: cubicBezier(0.175, 0.885, 0.32, 1.275),
};

/**
 * Piecewise interpolation (like Remotion's `interpolate` with clamping on both sides).
 * `easing` is applied to every segment between two stops, which is how CSS keyframes behave.
 */
export function interpolate(t: number, input: number[], output: number[], easing: EasingFn = Ease.linear): number {
  if (t <= input[0]) return output[0];
  const last = input.length - 1;
  if (t >= input[last]) return output[last];
  let i = 0;
  while (i < last - 1 && t > input[i + 1]) i++;
  const span = input[i + 1] - input[i];
  const p = span <= 0 ? 1 : (t - input[i]) / span;
  return lerp(output[i], output[i + 1], easing(p));
}

/** Position 0..1 inside a looping cycle of `period` seconds. */
export function cycle(time: number, period: number): number {
  const x = (time % period) / period;
  return x < 0 ? x + 1 : x;
}

/** 0..1..0 wave over a looping cycle (0 at the start of each period, 1 in the middle). */
export const wave = (time: number, period: number): number => 0.5 - 0.5 * Math.cos(2 * Math.PI * cycle(time, period));

/** Round to 4 decimals so generated CSS strings stay short and stable. */
export const r4 = (x: number): number => Math.round(x * 10000) / 10000;
