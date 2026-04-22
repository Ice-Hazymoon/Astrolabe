/**
 * Deterministic Canvas 2D drawing for the animated overlay, plus timing
 * helpers shared by the main-thread orchestrator and the rendering worker.
 *
 * Environment-neutral: only touches Canvas 2D APIs, so it loads cleanly in
 * both `window` and `Worker` contexts. Label text rendering is NOT in here
 * — labels are pre-rasterized on the main thread (where fonts are loaded)
 * and drawn as ImageBitmaps by `drawPrerenderedLabels`.
 */

import type {
  OverlayDeepSkyMarker,
  OverlayLineSegment,
  OverlayOptions,
  OverlayScene,
  OverlayStarMarker,
  OverlayTextItem,
  RgbaTuple,
} from '../types/api';

// ---------- Animation timing (mirror OverlayCanvas.tsx) ----------
//
// Entrance-only: everything fades/draws in on a gentle curve and then holds
// perfectly still. No breathing, no twinkling loops — the intent is a slow,
// cinematic reveal, not a dashboard of animated widgets.
//
// All durations / staggers are ~2x the "punchy" pacing used in earlier
// iterations, so the finished clip reads as composed rather than hurried.

export const EASE_OUT = makeCubicBezier(0.22, 1, 0.36, 1);

const LINE_BUILD = { baseDelay: 0.12, perItem: 0.008, duration: 1.8 };

const STAR_HALO_BUILD = { baseDelay: 0.28, perItem: 0.036, duration: 1.1 };
const STAR_RING_BUILD = { postDelay: 0.12, duration: 0.84 };
/** Resting opacity of the star halo ring once its entrance completes. */
const STAR_HALO_REST_ALPHA = 0.45;

const DSO_BUILD = { baseDelay: 0.36, perItem: 0.024, duration: 0.9 };
const LEADER_BUILD = { starBase: 0.4, dsoBase: 0.48, perItem: 0.024, duration: 0.7 };
const LABEL_BUILD = {
  constBase: 0.56,
  starBase: 0.68,
  dsoBase: 0.76,
  perItem: 0.04,
  duration: 0.6,
};

const STAGGER_CAP = 6.4;

// ---------- Public timing API ----------

export interface OverlayBuildInfo {
  buildEnd: number;
}

/**
 * Stable identifier for each animated overlay layer. Order here is the
 * intended back-to-front draw order — the video worker uses it to decide
 * which layers can be safely baked into the cumulative overlay cache.
 */
export type OverlayLayerId =
  | 'lines'
  | 'leaders'
  | 'dso_markers'
  | 'stars'
  | 'const_labels'
  | 'star_labels'
  | 'dso_labels';

export type OverlayLayerFilter = (id: OverlayLayerId) => boolean;

/** One enabled, non-empty layer plus the time at which its build animation
 * finishes (i.e. every element's `buildProgress` returns 1 from this time
 * on). The worker bakes layers one-by-one as their endTime is crossed. */
export interface OverlayLayerPlan {
  id: OverlayLayerId;
  endTime: number;
}

/**
 * Walk the scene + enabled-layer flags and return the layers that will
 * actually render something, in draw order, with their animation end
 * times. Layers that are disabled or empty are omitted entirely so the
 * worker doesn't waste a slot on them.
 */
export function planOverlayLayers(
  scene: OverlayScene,
  layers: OverlayOptions['layers'],
): OverlayLayerPlan[] {
  const plan: OverlayLayerPlan[] = [];

  if (layers.constellation_lines) {
    let lineCount = 0;
    for (const f of scene.constellation_figures) lineCount += f.segments.length;
    if (lineCount > 0) {
      plan.push({
        id: 'lines',
        endTime: staggeredEnd(lineCount, LINE_BUILD.baseDelay, LINE_BUILD.perItem, LINE_BUILD.duration),
      });
    }
  }

  if (layers.label_leaders) {
    let end = 0;
    if (layers.star_markers && layers.star_labels && scene.star_labels.length > 0) {
      end = Math.max(end, staggeredEnd(scene.star_labels.length, LEADER_BUILD.starBase, LEADER_BUILD.perItem, LEADER_BUILD.duration));
    }
    if (layers.deep_sky_markers && layers.deep_sky_labels && scene.deep_sky_labels.length > 0) {
      end = Math.max(end, staggeredEnd(scene.deep_sky_labels.length, LEADER_BUILD.dsoBase, LEADER_BUILD.perItem, LEADER_BUILD.duration));
    }
    if (end > 0) plan.push({ id: 'leaders', endTime: end });
  }

  if (layers.deep_sky_markers && scene.deep_sky_markers.length > 0) {
    plan.push({
      id: 'dso_markers',
      endTime: staggeredEnd(scene.deep_sky_markers.length, DSO_BUILD.baseDelay, DSO_BUILD.perItem, DSO_BUILD.duration),
    });
  }

  if (layers.star_markers && scene.star_markers.length > 0) {
    const last = staggered(scene.star_markers.length - 1, STAR_HALO_BUILD.baseDelay, STAR_HALO_BUILD.perItem);
    const end = Math.max(
      last + STAR_HALO_BUILD.duration,
      last + STAR_RING_BUILD.postDelay + STAR_RING_BUILD.duration,
    );
    plan.push({ id: 'stars', endTime: end });
  }

  if (layers.constellation_labels && scene.constellation_labels.length > 0) {
    plan.push({
      id: 'const_labels',
      endTime: staggeredEnd(scene.constellation_labels.length, LABEL_BUILD.constBase, LABEL_BUILD.perItem, LABEL_BUILD.duration),
    });
  }
  if (layers.star_markers && layers.star_labels && scene.star_labels.length > 0) {
    plan.push({
      id: 'star_labels',
      endTime: staggeredEnd(scene.star_labels.length, LABEL_BUILD.starBase, LABEL_BUILD.perItem, LABEL_BUILD.duration),
    });
  }
  if (layers.deep_sky_markers && layers.deep_sky_labels && scene.deep_sky_labels.length > 0) {
    plan.push({
      id: 'dso_labels',
      endTime: staggeredEnd(scene.deep_sky_labels.length, LABEL_BUILD.dsoBase, LABEL_BUILD.perItem, LABEL_BUILD.duration),
    });
  }

  return plan;
}

export function computeOverlayBuildInfo(
  scene: OverlayScene,
  layers: OverlayOptions['layers'],
): OverlayBuildInfo {
  let end = 0;
  for (const p of planOverlayLayers(scene, layers)) {
    if (p.endTime > end) end = p.endTime;
  }
  return { buildEnd: end };
}

// ---------- Pre-rasterized label bitmap bundle ----------

/** Output of main-thread label rasterization; passed into the worker. */
export interface LabelBitmap {
  bitmap: ImageBitmap;
  /** Top-left corner in scene (image) coordinates. */
  leftX: number;
  topY: number;
  width: number;
  height: number;
}

export interface LabelBitmapBundle {
  constellation: LabelBitmap[];
  star: LabelBitmap[];
  deepSky: LabelBitmap[];
}

// ---------- Primary draw entry point ----------

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * @param strokeBoost Multiplies lineWidths for strokes — used when the render
 * target is significantly smaller than the source image so thin lines don't
 * collapse to sub-pixel and wash out. 1 = no change.
 * @param include Optional layer filter. When set, only layers for which the
 * predicate returns true are drawn. Used by the worker to skip layers it
 * has already baked into its cumulative overlay cache, and conversely to
 * render one layer at a time when building the cache.
 */
export function drawOverlayFrame(
  ctx: Ctx2D,
  t: number,
  scene: OverlayScene,
  layers: OverlayOptions['layers'],
  labels: LabelBitmapBundle,
  strokeBoost = 1,
  include?: OverlayLayerFilter,
): void {
  const includes = (id: OverlayLayerId): boolean => !include || include(id);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Lines — bloom + crisp pass. Flatten the grouped figures so the existing
  // stagger-indexed draw routine stays unchanged; figures are only grouped at
  // the filter/data layer, not at the pixel level.
  if (layers.constellation_lines && includes('lines')) {
    const flatLines = scene.constellation_figures.flatMap((f) => f.segments);
    if (flatLines.length > 0) {
      drawConstellationLines(ctx, t, flatLines, 'bloom', strokeBoost);
      drawConstellationLines(ctx, t, flatLines, 'crisp', strokeBoost);
    }
  }

  if (layers.label_leaders && includes('leaders')) {
    if (layers.star_markers && layers.star_labels) {
      drawLeaders(ctx, t, scene.star_labels, LEADER_BUILD.starBase, strokeBoost);
    }
    if (layers.deep_sky_markers && layers.deep_sky_labels) {
      drawLeaders(ctx, t, scene.deep_sky_labels, LEADER_BUILD.dsoBase, strokeBoost);
    }
  }

  if (layers.deep_sky_markers && scene.deep_sky_markers.length > 0 && includes('dso_markers')) {
    drawDeepSkyMarkers(ctx, t, scene.deep_sky_markers, strokeBoost);
  }

  if (layers.star_markers && scene.star_markers.length > 0 && includes('stars')) {
    drawStarMarkers(ctx, t, scene.star_markers, 'bloom', strokeBoost);
    drawStarMarkers(ctx, t, scene.star_markers, 'crisp', strokeBoost);
  }

  if (layers.constellation_labels && includes('const_labels')) {
    drawPrerenderedLabels(ctx, t, labels.constellation, LABEL_BUILD.constBase);
  }
  if (layers.star_markers && layers.star_labels && includes('star_labels')) {
    drawPrerenderedLabels(ctx, t, labels.star, LABEL_BUILD.starBase);
  }
  if (layers.deep_sky_markers && layers.deep_sky_labels && includes('dso_labels')) {
    drawPrerenderedLabels(ctx, t, labels.deepSky, LABEL_BUILD.dsoBase);
  }

  ctx.restore();
}

// ---------- Per-element renderers ----------

// Stacked-stroke approximation of a gaussian glow. Three wide-to-narrow
// passes with rising alpha, composited source-over. We used to do this
// with `ctx.filter = 'blur(4.4px)'` which is visually smoother but
// triggers a separate Skia compositor-layer blur per stroke in Chrome —
// when multiple render workers all issue filter ops concurrently, the
// GPU command queue serializes them and the pool parallelism collapses.
// This multi-stroke path is pure stroke ops, stays parallel across
// workers, and in 30fps motion is essentially indistinguishable from
// the true blur.
const LINE_GLOW_STEPS: ReadonlyArray<{ widthMul: number; alphaMul: number }> = [
  { widthMul: 4.2, alphaMul: 0.10 },
  { widthMul: 2.6, alphaMul: 0.22 },
  { widthMul: 1.7, alphaMul: 0.36 },
];

const STAR_GLOW_STEPS: ReadonlyArray<{ widthMul: number; alphaMul: number }> = [
  { widthMul: 3.2, alphaMul: 0.15 },
  { widthMul: 1.8, alphaMul: 0.35 },
];

function drawConstellationLines(
  ctx: Ctx2D,
  t: number,
  segments: OverlayLineSegment[],
  pass: 'bloom' | 'crisp',
  strokeBoost: number,
): void {
  ctx.save();

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const delay = staggered(i, LINE_BUILD.baseDelay, LINE_BUILD.perItem);
    const progress = buildProgress(t, delay, LINE_BUILD.duration, EASE_OUT);
    if (progress <= 0) continue;

    const baseWidth = s.line_width * strokeBoost;

    // Dash pattern is per-segment (tied to draw-in progress). Set once,
    // then stroke the path 1 or N times with different styles.
    if (progress >= 1) {
      ctx.setLineDash([]);
    } else {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      const drawn = len * progress;
      ctx.setLineDash([drawn, Math.max(0.01, len - drawn)]);
    }
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);

    if (pass === 'bloom') {
      for (const step of LINE_GLOW_STEPS) {
        ctx.strokeStyle = rgbaStr(s.rgba, progress * step.alphaMul);
        ctx.lineWidth = baseWidth * step.widthMul;
        ctx.stroke();
      }
    } else {
      // Alpha ramps in with the path draw, then holds at the scene's native
      // rgba alpha. No breath, no loop.
      ctx.strokeStyle = rgbaStr(s.rgba, progress);
      ctx.lineWidth = baseWidth;
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawLeaders(
  ctx: Ctx2D,
  t: number,
  labels: OverlayTextItem[],
  baseDelay: number,
  strokeBoost: number,
): void {
  ctx.save();
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i].leader;
    if (!l) continue;
    const delay = staggered(i, baseDelay, LEADER_BUILD.perItem);
    const p = buildProgress(t, delay, LEADER_BUILD.duration, linearEase);
    if (p <= 0) continue;
    ctx.strokeStyle = rgbaStr(l.rgba, p);
    ctx.lineWidth = l.line_width * strokeBoost;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDeepSkyMarkers(
  ctx: Ctx2D,
  t: number,
  markers: OverlayDeepSkyMarker[],
  strokeBoost: number,
): void {
  ctx.save();
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const delay = staggered(i, DSO_BUILD.baseDelay, DSO_BUILD.perItem);
    const p = buildProgress(t, delay, DSO_BUILD.duration, EASE_OUT);
    if (p <= 0) continue;
    ctx.globalAlpha = p;
    ctx.strokeStyle = rgbaStr(m.rgba, 1);
    ctx.lineWidth = m.line_width * strokeBoost;
    ctx.beginPath();
    tracePath(ctx, m);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawStarMarkers(
  ctx: Ctx2D,
  t: number,
  stars: OverlayStarMarker[],
  pass: 'bloom' | 'crisp',
  strokeBoost: number,
): void {
  ctx.save();
  for (let i = 0; i < stars.length; i++) {
    const m = stars[i];
    const ringR = m.radius + 2.6;
    const haloR = m.radius + 5.2;
    const haloDelay = staggered(i, STAR_HALO_BUILD.baseDelay, STAR_HALO_BUILD.perItem);
    const haloP = buildProgress(t, haloDelay, STAR_HALO_BUILD.duration, EASE_OUT);
    const ringDelay = haloDelay + STAR_RING_BUILD.postDelay;
    const ringP = buildProgress(t, ringDelay, STAR_RING_BUILD.duration, EASE_OUT);

    if (haloP > 0) {
      // Halo fades + expands in together, then holds at the resting alpha.
      const baseWidth = 1.2 * strokeBoost;
      const baseAlpha = haloP * STAR_HALO_REST_ALPHA;
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(0.01, haloR * haloP), 0, Math.PI * 2);
      if (pass === 'bloom') {
        for (const step of STAR_GLOW_STEPS) {
          ctx.strokeStyle = rgbaStr(m.fill_rgba, baseAlpha * step.alphaMul);
          ctx.lineWidth = baseWidth * step.widthMul;
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = rgbaStr(m.fill_rgba, baseAlpha);
        ctx.lineWidth = baseWidth;
        ctx.stroke();
      }
    }
    if (ringP > 0) {
      const baseWidth = 1.4 * strokeBoost;
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(0.01, ringR * ringP), 0, Math.PI * 2);
      if (pass === 'bloom') {
        for (const step of STAR_GLOW_STEPS) {
          ctx.strokeStyle = rgbaStr(m.outline_rgba, step.alphaMul);
          ctx.lineWidth = baseWidth * step.widthMul;
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = rgbaStr(m.outline_rgba, 1);
        ctx.lineWidth = baseWidth;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawPrerenderedLabels(
  ctx: Ctx2D,
  t: number,
  labels: LabelBitmap[],
  baseDelay: number,
): void {
  if (labels.length === 0) return;
  ctx.save();
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    const delay = staggered(i, baseDelay, LABEL_BUILD.perItem);
    const p = buildProgress(t, delay, LABEL_BUILD.duration, linearEase);
    if (p <= 0) continue;
    const yShift = (1 - p) * 4;
    ctx.globalAlpha = p;
    ctx.drawImage(l.bitmap, l.leftX, l.topY + yShift, l.width, l.height);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------- Path helpers ----------

function tracePath(ctx: Ctx2D, m: OverlayDeepSkyMarker): void {
  const { x, y, radius: r } = m;
  switch (m.marker) {
    case 'triangle': {
      const h = r * 1.1547;
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + r, y + h / 2);
      ctx.lineTo(x - r, y + h / 2);
      ctx.closePath();
      return;
    }
    case 'diamond':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      return;
    case 'circle':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      return;
    case 'hexagon':
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      return;
    case 'ring': {
      const inner = r * 0.55;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x + inner, y);
      ctx.arc(x, y, inner, 0, Math.PI * 2);
      return;
    }
    case 'x_circle': {
      const c = r * Math.SQRT1_2;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x - c, y - c);
      ctx.lineTo(x + c, y + c);
      ctx.moveTo(x + c, y - c);
      ctx.lineTo(x - c, y + c);
      return;
    }
    case 'square':
    default:
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
  }
}

// ---------- Timing helpers ----------

export function staggered(i: number, base: number, perItem: number): number {
  return Math.min(STAGGER_CAP, base + Math.max(0, i) * perItem);
}

export function staggeredEnd(n: number, base: number, perItem: number, duration: number): number {
  if (n <= 0) return 0;
  return staggered(n - 1, base, perItem) + duration;
}

function buildProgress(
  t: number,
  delay: number,
  duration: number,
  ease: (x: number) => number,
): number {
  if (t <= delay) return 0;
  if (t >= delay + duration) return 1;
  return ease((t - delay) / duration);
}

function linearEase(x: number): number {
  return x;
}

function makeCubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let tGuess = x;
    for (let i = 0; i < 6; i++) {
      const curX = sampleX(tGuess) - x;
      const dx = sampleDX(tGuess);
      if (Math.abs(dx) < 1e-6) break;
      tGuess = tGuess - curX / dx;
    }
    return sampleY(clamp01(tGuess));
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ---------- Style helpers ----------

function rgbaStr(tuple: RgbaTuple, alphaMul: number): string {
  const [r, g, b, a] = tuple;
  const alpha = (a / 255) * alphaMul;
  return `rgba(${r | 0},${g | 0},${b | 0},${alpha.toFixed(3)})`;
}

// ---------- Label pre-rasterization (main thread only; fonts must be ready) ----------

const FONT_SANS =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans", "Microsoft YaHei", sans-serif';
const FONT_SERIF = '"Spectral", "Noto Serif SC", "Iowan Old Style", Georgia, "Songti SC", serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function fontFamilyFor(family: OverlayTextItem['font_family']): string {
  switch (family) {
    case 'serif':
      return FONT_SERIF;
    case 'mono':
      return FONT_MONO;
    case 'sans':
    default:
      return FONT_SANS;
  }
}

function estimateTextWidth(t: OverlayTextItem): number {
  const wideMul = t.font_family === 'serif' ? 1.04 : t.font_family === 'mono' ? 1.08 : 1.0;
  const italicMul = t.italic ? 1.03 : 1.0;
  const letterSpacingEm = t.letter_spacing ?? 0;
  let advance = 0;
  let count = 0;
  for (const ch of t.text) {
    count += 1;
    const code = ch.codePointAt(0) ?? 0;
    advance += code >= 0x2e80 ? 1.0 : 0.58;
  }
  return (
    (advance * wideMul * italicMul + Math.max(0, count - 1) * letterSpacingEm) * t.font_size
  );
}

/**
 * Rasterize a single OverlayTextItem (chip + stroke + fill) to a tight
 * OffscreenCanvas bitmap at scene resolution. Returns the bitmap along with
 * its top-left position in scene coordinates. Must run on the main thread
 * after `document.fonts.ready` — worker contexts don't share fonts.
 */
export function prerenderLabel(item: OverlayTextItem): LabelBitmap {
  const textW = item.text_width ?? estimateTextWidth(item);
  const ascent = item.font_size * 0.82;
  const descent = item.font_size * 0.24;
  const padX = item.chip?.padding_x ?? 0;
  const padY = item.chip?.padding_y ?? 0;
  // Extra halo for the text stroke so it doesn't clip at the bitmap edge.
  const strokePad = Math.ceil(Math.max(0, item.stroke_width) + 1);

  const boxX = item.x - padX - strokePad;
  const boxY = item.y - ascent - padY - strokePad;
  const boxW = Math.ceil(textW + padX * 2 + strokePad * 2);
  const boxH = Math.ceil(ascent + descent + padY * 2 + strokePad * 2);

  const canvas = new OffscreenCanvas(Math.max(1, boxW), Math.max(1, boxH));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('label canvas ctx unavailable');
  ctx.translate(-boxX, -boxY);

  if (item.chip) {
    const rx = item.chip.radius;
    const x = item.x - item.chip.padding_x;
    const y = item.y - ascent - item.chip.padding_y;
    const w = textW + item.chip.padding_x * 2;
    const h = ascent + descent + item.chip.padding_y * 2;
    roundRectPath(ctx, x, y, w, h, rx);
    ctx.fillStyle = rgbaStr(item.chip.fill_rgba, 1);
    ctx.fill();
    if (item.chip.border_rgba) {
      ctx.strokeStyle = rgbaStr(item.chip.border_rgba, 1);
      ctx.lineWidth = item.chip.border_width ?? 1;
      ctx.stroke();
    }
  }

  const weight = item.font_weight ?? 600;
  const style = item.italic ? 'italic' : 'normal';
  const family = fontFamilyFor(item.font_family);
  ctx.font = `${style} ${weight} ${item.font_size}px ${family}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // paint-order: stroke fill
  if (item.stroke_width > 0) {
    ctx.strokeStyle = rgbaStr(item.stroke_rgba, 1);
    ctx.lineWidth = item.stroke_width;
    ctx.lineJoin = 'round';
    ctx.strokeText(item.text, item.x, item.y);
  }
  ctx.fillStyle = rgbaStr(item.text_rgba, 1);
  ctx.fillText(item.text, item.x, item.y);

  const bitmap = canvas.transferToImageBitmap();
  return {
    bitmap,
    leftX: boxX,
    topY: boxY,
    width: boxW,
    height: boxH,
  };
}

function roundRectPath(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
