/**
 * Main-thread orchestrator for MP4 export. Prepares inputs that need DOM or
 * main-thread fonts (photo, strip SVG raster, per-label bitmaps), then hands
 * everything to a dedicated Worker that runs the encode loop.
 *
 * This file stays DOM-aware; `videoWorker.ts` is pure worker-scope code and
 * `videoFrame.ts` is environment-neutral drawing/timing.
 */

import type { OverlayOptions, OverlayScene } from '../types/api';
import { buildStripSvg, stripHeightFor, type StripMeta } from './composite';
import {
  prerenderLabel,
  type LabelBitmap,
  type LabelBitmapBundle,
} from './videoFrame';
import type {
  VideoWorkerInMessage,
  VideoWorkerOutMessage,
  VideoWorkerStartMessage,
} from './videoWorker';

// ---------- Public API ----------

export interface VideoExportOptions {
  imageSrc: string;
  scene: OverlayScene;
  layers: OverlayOptions['layers'];
  meta: StripMeta;
  /** Max output width in px. Height scales to preserve aspect. Default 1920 (1080p). */
  maxWidth?: number;
  /** Frames per second. Default 30. */
  fps?: number;
  /** Target bitrate in bps; default chosen from resolution. */
  bitrate?: number;
  /** 0..1 progress callback. */
  onProgress?(progress: number): void;
  /** Cancel an in-flight export. */
  signal?: AbortSignal;
}

export interface VideoExportResult {
  blobUrl: string;
  durationMs: number;
  width: number;
  height: number;
}

export class WebCodecsUnsupportedError extends Error {
  constructor() {
    super('WebCodecs is not available in this browser.');
    this.name = 'WebCodecsUnsupportedError';
  }
}

export async function isVideoExportSupported(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
  if (typeof OffscreenCanvas === 'undefined') return false;
  if (typeof Worker === 'undefined') return false;
  try {
    const res = await VideoEncoder.isConfigSupported({
      codec: 'avc1.640028',
      width: 1280,
      height: 720,
      bitrate: 4_000_000,
      framerate: 30,
    });
    return !!res.supported;
  } catch {
    return false;
  }
}

export async function exportAnnotatedVideo(
  opts: VideoExportOptions,
): Promise<VideoExportResult> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new WebCodecsUnsupportedError();
  }

  const fps = opts.fps ?? 30;

  // --- 1. Load inputs, pick sizes ---------------------------------------
  const photoImg = await loadImage(opts.imageSrc);
  const srcW = opts.scene.image_width > 0 ? opts.scene.image_width : photoImg.naturalWidth;
  const srcH = opts.scene.image_height > 0 ? opts.scene.image_height : photoImg.naturalHeight;
  if (!srcW || !srcH) throw new Error('missing image dimensions');

  const maxW = opts.maxWidth ?? 1920;
  const scale = Math.min(1, maxW / srcW);
  const overlayW = makeEven(Math.round(srcW * scale));
  const overlayH = makeEven(Math.round(srcH * scale));
  const stripH = makeEven(stripHeightFor(overlayW));
  const outW = overlayW;
  const outH = overlayH + stripH;
  // Boost stroke widths when the output is smaller than the source photo so
  // constellation lines / star rings don't collapse to sub-pixel smudge. Cap
  // at 1.8x — beyond that lines look comically thick.
  const strokeBoost = Math.min(1.8, Math.max(1, srcW / overlayW));

  await ensureFontsReady();

  // --- 2. Rasterize static assets (main thread) -------------------------
  const [photoBitmap, stripBitmap] = await Promise.all([
    createImageBitmap(photoImg, {
      resizeWidth: overlayW,
      resizeHeight: overlayH,
      resizeQuality: 'high',
    }),
    rasterizeStrip(overlayW, stripH, opts.meta),
  ]);

  if (opts.signal?.aborted) {
    photoBitmap.close?.();
    stripBitmap.close?.();
    throw new DOMException('Video export aborted', 'AbortError');
  }

  // --- 3. Pre-rasterize labels (main thread — fonts are here) -----------
  const labels = await prerenderAllLabels(opts.scene, opts.layers, opts.signal);

  if (opts.signal?.aborted) {
    releaseBitmaps(labels, photoBitmap, stripBitmap);
    throw new DOMException('Video export aborted', 'AbortError');
  }

  // --- 4. Pick codec + bitrate ------------------------------------------
  const bitrate = opts.bitrate ?? pickBitrate(outW, outH);
  const pick = await pickSupportedCodec(outW, outH, fps, bitrate);
  if (!pick) {
    releaseBitmaps(labels, photoBitmap, stripBitmap);
    throw new WebCodecsUnsupportedError();
  }
  const { codec, family: codecFamily } = pick;

  // --- 5. Spawn worker + send start message -----------------------------
  const worker = new Worker(new URL('./videoWorker.ts', import.meta.url), { type: 'module' });

  const onAbort = () => {
    const msg: VideoWorkerInMessage = { type: 'cancel' };
    worker.postMessage(msg);
  };
  opts.signal?.addEventListener('abort', onAbort);

  const resultPromise = new Promise<VideoExportResult>((resolve, reject) => {
    worker.addEventListener('message', (ev: MessageEvent<VideoWorkerOutMessage>) => {
      const data = ev.data;
      if (data.type === 'progress') {
        opts.onProgress?.(data.pct);
      } else if (data.type === 'done') {
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);
        resolve({
          blobUrl,
          durationMs: data.durationMs,
          width: data.width,
          height: data.height,
        });
      } else if (data.type === 'error') {
        const err = data.name === 'AbortError'
          ? new DOMException(data.message, 'AbortError')
          : new Error(data.message);
        reject(err);
      }
    });
    worker.addEventListener('error', (ev) => {
      reject(new Error(ev.message || 'worker error'));
    });
  });

  const startMessage: VideoWorkerStartMessage = {
    type: 'start',
    photo: photoBitmap,
    strip: stripBitmap,
    scene: opts.scene,
    layers: opts.layers,
    labels,
    outW,
    outH,
    overlayW,
    overlayH,
    stripH,
    srcW,
    srcH,
    fps,
    bitrate,
    codec,
    codecFamily,
    strokeBoost,
  };

  // Transfer all bitmaps into the worker — they're unusable on the main
  // thread afterwards, which is fine since we're done with them here.
  const transferList: Transferable[] = [photoBitmap, stripBitmap];
  for (const arr of [labels.constellation, labels.star, labels.deepSky]) {
    for (const l of arr) transferList.push(l.bitmap);
  }
  worker.postMessage(startMessage, transferList);

  try {
    return await resultPromise;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    worker.terminate();
  }
}

// ---------- Helpers ----------

function makeEven(n: number): number {
  return n % 2 === 0 ? n : n + 1;
}

function pickBitrate(w: number, h: number): number {
  const pixels = w * h;
  // Generous targets — disk is cheap, clarity matters. These bitrates apply
  // to both H.264 and HEVC; HEVC just gets better detail at the same budget.
  if (pixels <= 1280 * 720) return 10_000_000;
  if (pixels <= 1920 * 1080) return 20_000_000;
  if (pixels <= 2560 * 1440) return 32_000_000;
  if (pixels <= 3840 * 2160) return 55_000_000;
  return 80_000_000;
}

interface CodecPick {
  codec: string;
  family: 'avc' | 'hevc';
}

/**
 * Try each codec string in our preference list (HEVC first for best
 * clarity-per-bit, then H.264 for compatibility). Returns the first one
 * `VideoEncoder.isConfigSupported` accepts with the requested resolution
 * and bitrate. If every candidate is rejected, returns null and we surface
 * `WebCodecsUnsupportedError` to the caller.
 */
async function pickSupportedCodec(
  w: number,
  h: number,
  fps: number,
  bitrate: number,
): Promise<CodecPick | null> {
  for (const pick of codecCandidates(w, h, fps)) {
    const config: VideoEncoderConfig = {
      codec: pick.codec,
      width: w,
      height: h,
      bitrate,
      framerate: fps,
    };
    if (pick.family === 'avc') {
      (config as VideoEncoderConfig & { avc?: { format: 'avc' } }).avc = { format: 'avc' };
    } else {
      (config as VideoEncoderConfig & { hevc?: { format: 'hevc' } }).hevc = { format: 'hevc' };
    }
    try {
      const res = await VideoEncoder.isConfigSupported(config);
      if (res.supported) return pick;
    } catch {
      /* try next */
    }
  }
  return null;
}

function codecCandidates(w: number, h: number, fps: number): CodecPick[] {
  const out: CodecPick[] = [];
  const pixels = w * h;

  // ---- HEVC (Main Profile) first — 30–50% smaller at same quality, much
  // sharper at our chosen bitrates. hvc1.1.6.L<level>.B0 encoding:
  //   L90 = 3.0 (720p30), L93 = 3.1 (720p60),
  //   L120 = 4.0 (1080p30), L123 = 4.1 (1080p60),
  //   L150 = 5.0 (2160p30), L153 = 5.1 (4K60).
  // Safari 16.4+, Chrome 107+ (with HW decoder), Edge 107+. Firefox: no.
  if (pixels > 3840 * 2160 || fps > 60) {
    out.push({ codec: 'hvc1.1.6.L156.B0', family: 'hevc' }); // 5.2
  }
  if (pixels > 2560 * 1440 || (pixels > 1920 * 1080 && fps > 30)) {
    out.push({ codec: 'hvc1.1.6.L153.B0', family: 'hevc' }); // 5.1 (4K60)
  }
  if (pixels > 1920 * 1080) {
    out.push({ codec: 'hvc1.1.6.L150.B0', family: 'hevc' }); // 5.0 (1440p/4K30)
  }
  if (fps > 30) {
    out.push({ codec: 'hvc1.1.6.L123.B0', family: 'hevc' }); // 4.1 (1080p60)
  }
  out.push({ codec: 'hvc1.1.6.L120.B0', family: 'hevc' });   // 4.0 (1080p30) — most likely hit
  out.push({ codec: 'hvc1.1.6.L93.B0',  family: 'hevc' });   // 3.1 (720p60)

  // ---- H.264 High Profile fallback chain.
  if (pixels > 3840 * 2160 || fps > 60) {
    out.push({ codec: 'avc1.640034', family: 'avc' }); // 5.2
  }
  if (pixels > 2560 * 1440) {
    out.push({ codec: 'avc1.640033', family: 'avc' }); // 5.1 (4K30)
  }
  if (pixels > 1920 * 1080) {
    out.push({ codec: 'avc1.640032', family: 'avc' }); // 5.0 (1440p)
  }
  if (pixels > 1920 * 1080 || fps > 30) {
    out.push({ codec: 'avc1.640029', family: 'avc' }); // 4.1
  }
  out.push({ codec: 'avc1.640028', family: 'avc' }); // 4.0 — ubiquitous
  out.push({ codec: 'avc1.4D401F', family: 'avc' }); // Main 3.1 — broad HW
  out.push({ codec: 'avc1.42E01E', family: 'avc' }); // Baseline 3.0 — last-ditch
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

async function rasterizeStrip(
  w: number,
  h: number,
  meta: StripMeta,
): Promise<ImageBitmap> {
  const markup = buildStripSvg(w, h, meta);
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prerenderAllLabels(
  scene: OverlayScene,
  layers: OverlayOptions['layers'],
  signal?: AbortSignal,
): Promise<LabelBitmapBundle> {
  const constellation = layers.constellation_labels
    ? await prerenderInChunks(scene.constellation_labels, signal)
    : [];
  const star = layers.star_labels
    ? await prerenderInChunks(scene.star_labels, signal)
    : [];
  const deepSky =
    layers.deep_sky_markers && layers.deep_sky_labels
      ? await prerenderInChunks(scene.deep_sky_labels, signal)
      : [];
  return { constellation, star, deepSky };
}

async function prerenderInChunks<T extends Parameters<typeof prerenderLabel>[0]>(
  items: T[],
  signal?: AbortSignal,
): Promise<LabelBitmap[]> {
  const out: LabelBitmap[] = [];
  const CHUNK = 40;
  for (let i = 0; i < items.length; i += CHUNK) {
    if (signal?.aborted) return out;
    for (let k = i; k < Math.min(i + CHUNK, items.length); k++) {
      out.push(prerenderLabel(items[k]));
    }
    // Yield so the progress UI can paint and Escape still works.
    await nextTick();
  }
  return out;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function ensureFontsReady(): Promise<void> {
  const fonts = (document as Document & { fonts?: { ready: Promise<FontFaceSet> } }).fonts;
  if (fonts?.ready) {
    try {
      await fonts.ready;
    } catch {
      /* ignore */
    }
  }
}

function releaseBitmaps(
  labels: LabelBitmapBundle,
  ...extra: (ImageBitmap | undefined)[]
): void {
  for (const arr of [labels.constellation, labels.star, labels.deepSky]) {
    for (const l of arr) l.bitmap.close?.();
  }
  for (const b of extra) b?.close?.();
}
