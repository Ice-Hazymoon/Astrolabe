/**
 * Main-thread orchestrator for MP4 export. Prepares inputs that need DOM or
 * main-thread fonts (photo, strip SVG raster, per-label bitmaps), then hands
 * everything to a dedicated Worker that runs the encode loop.
 *
 * This file stays DOM-aware; `videoWorker.ts` is pure worker-scope code and
 * `videoFrame.ts` is environment-neutral drawing/timing.
 */

import type { OverlayOptions, OverlayScene } from '../types/api';
import type { DetailsFilters } from '../state/store';
import { buildStripSvg, stripHeightFor, type StripMeta } from './composite';
import { applyDetailsFilters } from './detailsFilter';
import {
  computeOverlayBuildInfo,
  prerenderLabel,
  type LabelBitmap,
  type LabelBitmapBundle,
} from './videoFrame';
import type {
  TimingEntry,
  VideoWorkerOutMessage,
} from './videoWorker';
import type { VideoRenderWorkerOutMessage } from './videoRenderWorker';

// ---------- Perf instrumentation ----------
//
// Each export records stage markers, merges the worker's timing events in,
// and logs a single `console.table` on success. Keep permanently enabled —
// cost is negligible (one `performance.now` per mark), and when users
// report "feels slow" we have an actual breakdown instead of guesswork.
class ExportTimings {
  private readonly t0 = performance.now();
  private readonly entries: TimingEntry[] = [];
  mark(stage: string): void {
    this.entries.push({ stage, t: performance.now() - this.t0 });
  }
  /** ms since construction — useful to stamp "worker started now" against
   * the main-thread clock so worker-local timings can be rebased. */
  elapsed(): number {
    return performance.now() - this.t0;
  }
  /**
   * Merge worker-reported timings in. Worker marks are emitted relative to
   * the worker's own start, so we rebase them against the main-thread
   * offset captured when we sent the start message — giving one unified
   * timeline rather than two disjoint clocks.
   */
  mergeWorker(workerTimings: TimingEntry[], workerStartOffsetMs: number): void {
    for (const e of workerTimings) {
      this.entries.push({ stage: `w:${e.stage}`, t: workerStartOffsetMs + e.t });
    }
    this.entries.sort((a, b) => a.t - b.t);
  }
  log(extra: Record<string, unknown>): void {
    const rows: Array<Record<string, string | number>> = [];
    let prev = 0;
    for (const e of this.entries) {
      rows.push({
        stage: e.stage,
        elapsed_ms: Math.round(e.t),
        delta_ms: Math.round(e.t - prev),
      });
      prev = e.t;
    }
    console.groupCollapsed(
      `[video-export] total=${Math.round(prev)}ms`,
      extra,
    );
    console.table(rows);
    console.groupEnd();
  }
}

async function yieldToMain(): Promise<void> {
  const sch = (globalThis as { scheduler?: { yield?(): Promise<void> } }).scheduler;
  if (sch?.yield) {
    await sch.yield();
  } else {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Downscale a photo onto an ImageBitmap via Canvas 2D. All modern browsers
 * back Canvas 2D `drawImage` with GPU-accelerated scaling, which is 10–100×
 * faster than `createImageBitmap(img, { resizeQuality: 'high' })` on
 * mobile — that path runs CPU lanczos and can take 500–2000ms for large
 * photos on iOS Safari. Visual quality is indistinguishable for photo
 * downscales in our ratio range (1×–3×); any sub-pixel differences are
 * erased by H.264/HEVC compression anyway.
 */
function resizePhotoViaCanvas(
  img: HTMLImageElement,
  w: number,
  h: number,
): ImageBitmap {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('photo resize ctx unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.transferToImageBitmap();
}

// "No filter active" sentinel — same pattern as composite.ts so callers that
// don't pass filters get an identity-return fast path in applyDetailsFilters.
const NO_FILTERS: DetailsFilters = {
  starsHidden: new Set<string>(),
  starSolo: null,
  constellationsHidden: new Set<string>(),
  constellationSolo: null,
  dsosHidden: new Set<string>(),
  dsoSolo: null,
};

// ---------- Public API ----------

export interface VideoExportOptions {
  imageSrc: string;
  scene: OverlayScene;
  layers: OverlayOptions['layers'];
  meta: StripMeta;
  /**
   * Per-item visibility filters (hide / solo) mirroring the ResultDetailsSheet.
   * Optional — when absent, all items in `scene` are rendered.
   */
  filters?: DetailsFilters;
  /**
   * When false, the bottom attribution strip is omitted and the output is
   * sized to just the photo + overlay. Defaults to true.
   */
  includeStrip?: boolean;
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

  const T = new ExportTimings();
  T.mark('start');

  const fps = opts.fps ?? 30;

  // Apply per-item hide/solo filters once, up-front. Downstream steps
  // (label prerender, worker start message) all consume this filtered scene
  // so the rendered MP4 mirrors what the live viewer paints.
  const scene = applyDetailsFilters(opts.scene, opts.filters ?? NO_FILTERS);

  // --- 1. Load inputs, pick sizes ---------------------------------------
  const photoImg = await loadImage(opts.imageSrc);
  T.mark('image-loaded');
  const srcW = scene.image_width > 0 ? scene.image_width : photoImg.naturalWidth;
  const srcH = scene.image_height > 0 ? scene.image_height : photoImg.naturalHeight;
  if (!srcW || !srcH) throw new Error('missing image dimensions');

  const maxW = opts.maxWidth ?? 1920;
  const scale = Math.min(1, maxW / srcW);
  const overlayW = makeEven(Math.round(srcW * scale));
  const overlayH = makeEven(Math.round(srcH * scale));
  const includeStrip = opts.includeStrip !== false;
  const stripH = includeStrip ? makeEven(stripHeightFor(overlayW)) : 0;
  const outW = overlayW;
  const outH = overlayH + stripH;
  // Boost stroke widths when the output is smaller than the source photo so
  // constellation lines / star rings don't collapse to sub-pixel smudge. Cap
  // at 1.8x — beyond that lines look comically thick.
  const strokeBoost = Math.min(1.8, Math.max(1, srcW / overlayW));

  // Kick off codec probing as soon as dimensions are known. The probe is
  // I/O against the platform's codec registry (100–500ms/candidate on
  // mobile) and has no dependency on fonts, bitmaps, or labels — so let
  // it race with the rasterization work below.
  const bitrate = opts.bitrate ?? pickBitrate(outW, outH);
  const codecKey = codecCacheKey(outW, outH, fps, bitrate);
  const codecPromise = pickSupportedCodec(outW, outH, fps, bitrate);

  await ensureFontsReady();
  T.mark('fonts-ready');

  // --- 2. Rasterize static assets (main thread) -------------------------
  // Photo goes through Canvas 2D + GPU scale instead of createImageBitmap's
  // CPU lanczos — on iOS Safari with a 24MP source that's 500–2000ms vs
  // ~20ms, and visual quality is imperceptible after compression.
  const photoBitmap = resizePhotoViaCanvas(photoImg, overlayW, overlayH);
  const stripBitmap = includeStrip
    ? await rasterizeStrip(overlayW, stripH, opts.meta)
    : null;
  T.mark('bitmaps-ready');

  if (opts.signal?.aborted) {
    photoBitmap.close?.();
    stripBitmap?.close?.();
    throw new DOMException('Video export aborted', 'AbortError');
  }

  // --- 3. Pre-rasterize labels (main thread — fonts are here) -----------
  const labels = await prerenderAllLabels(scene, opts.layers, opts.signal);
  T.mark('labels-ready');

  if (opts.signal?.aborted) {
    releaseBitmaps(labels, photoBitmap, stripBitmap);
    throw new DOMException('Video export aborted', 'AbortError');
  }

  // --- 4. Await the codec probe (kicked off in parallel above) ----------
  const pick = await codecPromise;
  T.mark('codec-picked');
  // Re-check abort after the codec probe. `addEventListener('abort', ...)`
  // does not replay prior events, so any abort that fired during one of
  // the awaits above must be caught here before we spin up the worker.
  if (opts.signal?.aborted) {
    releaseBitmaps(labels, photoBitmap, stripBitmap);
    throw new DOMException('Video export aborted', 'AbortError');
  }
  if (!pick) {
    releaseBitmaps(labels, photoBitmap, stripBitmap);
    throw new WebCodecsUnsupportedError();
  }
  const { codec, family: codecFamily } = pick;

  // --- 5. Compute timing params (was done inside the old worker) -------
  const introDuration = 1.0;
  const holdDuration = 2.0;
  const { buildEnd } = computeOverlayBuildInfo(scene, opts.layers);
  const totalDuration = introDuration + buildEnd + holdDuration;
  const totalFrames = Math.max(1, Math.round(totalDuration * fps));
  const usPerFrame = Math.round(1_000_000 / fps);
  const keyEvery = fps * 2;
  const durationMs = Math.round(totalDuration * 1000);

  // --- 6. Spawn encoder worker + render-worker pool --------------------
  const N = pickRenderPoolSize();
  // Log the pool decision up-front so "is the pool actually engaged?" is
  // answerable at a glance when users paste back their console output.
  console.log(
    `[video-export] pool: N=${N} (`,
    `hardwareConcurrency=${navigator.hardwareConcurrency},`,
    `deviceMemory=${(navigator as { deviceMemory?: number }).deviceMemory ?? 'unknown'})`,
  );
  // Keep each render worker's in-flight output bounded so the main thread's
  // message queue (and encoder's pendingFrames map) can't balloon if the
  // encoder falls behind. 2 pipelines render/encode without wasting cores.
  const INFLIGHT_WINDOW = 2;

  const encoderWorker = new Worker(
    new URL('./videoWorker.ts', import.meta.url),
    { type: 'module' },
  );
  const renderWorkers: Worker[] = [];
  for (let k = 0; k < N; k++) {
    renderWorkers.push(
      new Worker(new URL('./videoRenderWorker.ts', import.meta.url), { type: 'module' }),
    );
  }
  T.mark('workers-spawned');

  interface WorkerReport {
    timings: TimingEntry[];
    framesEncoded: number;
  }
  let workerReport: WorkerReport | null = null;
  let workerStartOffsetMs = 0;

  const onAbort = () => {
    for (const w of renderWorkers) w.postMessage({ type: 'cancel' });
    encoderWorker.postMessage({ type: 'cancel' });
  };
  opts.signal?.addEventListener('abort', onAbort);
  if (opts.signal?.aborted) {
    opts.signal.removeEventListener('abort', onAbort);
    terminateAll(encoderWorker, renderWorkers);
    releaseBitmaps(labels, photoBitmap, stripBitmap);
    throw new DOMException('Video export aborted', 'AbortError');
  }

  const resultPromise = new Promise<VideoExportResult>((resolve, reject) => {
    // Encoder → main. Frame-encoded events become acks routed back to the
    // render worker that produced that index (idx % N = producer).
    encoderWorker.addEventListener('message', (ev: MessageEvent<VideoWorkerOutMessage>) => {
      const data = ev.data;
      if (data.type === 'encoded') {
        const producerIdx = data.idx % N;
        renderWorkers[producerIdx]?.postMessage({ type: 'ack' });
      } else if (data.type === 'progress') {
        opts.onProgress?.(data.pct);
      } else if (data.type === 'done') {
        workerReport = { timings: data.timings, framesEncoded: data.framesEncoded };
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
    encoderWorker.addEventListener('error', (ev) => {
      reject(new Error(ev.message || 'encoder worker error'));
    });

    // Render workers → main. Frames forwarded straight to the encoder
    // worker (bitmap transferred each hop). Render-worker 'done' just
    // signals stripe completion; we wait on the encoder's 'done'.
    for (const rw of renderWorkers) {
      rw.addEventListener('message', (ev: MessageEvent<VideoRenderWorkerOutMessage>) => {
        const data = ev.data;
        if (data.type === 'frame') {
          encoderWorker.postMessage(
            { type: 'frame', idx: data.idx, bitmap: data.bitmap },
            [data.bitmap],
          );
        } else if (data.type === 'error') {
          const err = data.name === 'AbortError'
            ? new DOMException(data.message, 'AbortError')
            : new Error(data.message);
          reject(err);
        }
      });
      rw.addEventListener('error', (ev) => {
        reject(new Error(ev.message || 'render worker error'));
      });
    }
  });

  // Send encoder init first so it's ready before render bitmaps arrive.
  encoderWorker.postMessage({
    type: 'init',
    outW,
    outH,
    fps,
    bitrate,
    codec,
    codecFamily,
    totalFrames,
    keyEvery,
    usPerFrame,
    durationMs,
  });

  // Dispatch init to every render worker. We structured-clone the
  // shared assets for all but the last worker, then transfer to the last
  // one so the main thread releases its copies. `postMessage` is synchronous
  // with respect to its transfer-list handling, so cloning before transfer
  // stays consistent.
  for (let k = 0; k < N; k++) {
    const isLast = k === N - 1;
    const xfer: Transferable[] = [];
    if (isLast) {
      xfer.push(photoBitmap);
      if (stripBitmap) xfer.push(stripBitmap);
      for (const arr of [labels.constellation, labels.star, labels.deepSky]) {
        for (const l of arr) xfer.push(l.bitmap);
      }
    }
    renderWorkers[k].postMessage(
      {
        type: 'init',
        photo: photoBitmap,
        strip: stripBitmap,
        scene,
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
        strokeBoost,
        introDuration,
        buildEnd,
        totalFrames,
        stripeOffset: k,
        stripeStride: N,
        inFlightWindow: INFLIGHT_WINDOW,
      },
      xfer,
    );
  }
  T.mark('workers-init-posted');
  workerStartOffsetMs = T.elapsed();

  try {
    const result = await resultPromise;
    T.mark('workers-done');
    const report = workerReport as WorkerReport | null;
    if (report) {
      T.mergeWorker(report.timings, workerStartOffsetMs);
      T.log({
        codec,
        codecFamily,
        outW,
        outH,
        fps,
        bitrate,
        renderPoolSize: N,
        framesEncoded: report.framesEncoded,
        totalFrames,
      });
    }
    return result;
  } catch (err) {
    // Cached codec pick that fails at configure/encode time would keep
    // failing on retries. Flush on non-abort so the next attempt re-probes.
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      clearCachedCodec(codecKey);
    }
    throw err;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    terminateAll(encoderWorker, renderWorkers);
  }
}

function terminateAll(encoder: Worker, renderPool: Worker[]): void {
  encoder.terminate();
  for (const w of renderPool) w.terminate();
}

/**
 * Pick how many render workers to spawn. Caps at 3 because peak memory
 * (each worker holds its own base bitmap + frame canvas + overlay cache)
 * starts crowding the ~4 GB per-tab budget on mobile beyond that.
 *
 * Floor at **2** (not 1) as long as memory isn't actively constrained.
 * Safari intentionally under-reports `hardwareConcurrency` (commonly 2)
 * as an anti-fingerprinting measure; honoring that literally collapsed
 * the pool to a single render worker on iPhones, wiping out every bit
 * of parallelism. Main and encoder threads are near-idle during render
 * (pure message routing + async encode calls), so oversubscribing by 1
 * on a true 2-core device just means some OS scheduling — not contention
 * that actually hurts. Low-memory devices (<3 GB) still fall back to
 * N=1 because there the risk is OOM, not scheduling overhead.
 */
function pickRenderPoolSize(): number {
  const cores = navigator.hardwareConcurrency ?? 4;
  const memGB = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  if (memGB < 3) return 1;
  if (memGB < 4) return 2;
  // 4+ GB memory — let core count pick between 2 and 3.
  return cores >= 6 ? 3 : 2;
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

// Session-scoped cache for the codec decision. Each isConfigSupported call
// can take 100–500ms on mobile; probing ~10 candidates serially used to
// stall the export dialog for multiple seconds. Cached per
// (width, height, fps, bitrate) so different export settings don't collide.
const CODEC_CACHE_PREFIX = 'sky-video-codec-v1';

function codecCacheKey(w: number, h: number, fps: number, bitrate: number): string {
  return `${CODEC_CACHE_PREFIX}:${w}x${h}@${fps}:${bitrate}`;
}

function readCachedCodec(key: string): CodecPick | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CodecPick>;
    if (
      parsed &&
      typeof parsed.codec === 'string' &&
      (parsed.family === 'avc' || parsed.family === 'hevc')
    ) {
      return { codec: parsed.codec, family: parsed.family };
    }
  } catch {
    /* sessionStorage disabled or corrupt — fall through to probe */
  }
  return null;
}

function writeCachedCodec(key: string, pick: CodecPick): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(pick));
  } catch {
    /* quota or storage disabled — caching is best-effort */
  }
}

function clearCachedCodec(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function buildProbeConfig(
  pick: CodecPick,
  w: number,
  h: number,
  fps: number,
  bitrate: number,
): VideoEncoderConfig {
  const config: VideoEncoderConfig = {
    codec: pick.codec,
    width: w,
    height: h,
    bitrate,
    framerate: fps,
    // Match the hint we use when actually configuring the encoder so the
    // probe result reflects the real runtime pick — otherwise a codec that
    // probes supported via software could still fail to configure with
    // prefer-hardware on a device that only has HW decode support.
    hardwareAcceleration: 'prefer-hardware',
  };
  if (pick.family === 'avc') {
    (config as VideoEncoderConfig & { avc?: { format: 'avc' } }).avc = { format: 'avc' };
  } else {
    (config as VideoEncoderConfig & { hevc?: { format: 'hevc' } }).hevc = { format: 'hevc' };
  }
  return config;
}

/**
 * Pick the best-supported codec (HEVC preferred for clarity-per-bit, then
 * H.264 for compatibility). Probes all candidates concurrently — Promise.all
 * preserves input order so we can still return the first supported entry
 * in preference order. Result is cached in sessionStorage to make repeat
 * exports instant. Returns null if nothing works.
 */
async function pickSupportedCodec(
  w: number,
  h: number,
  fps: number,
  bitrate: number,
): Promise<CodecPick | null> {
  const cacheKey = codecCacheKey(w, h, fps, bitrate);
  const cached = readCachedCodec(cacheKey);
  if (cached) return cached;

  const candidates = codecCandidates(w, h, fps);
  const results = await Promise.all(
    candidates.map(async (pick): Promise<CodecPick | null> => {
      try {
        const res = await VideoEncoder.isConfigSupported(
          buildProbeConfig(pick, w, h, fps, bitrate),
        );
        return res.supported ? pick : null;
      } catch {
        return null;
      }
    }),
  );
  const chosen = results.find((r): r is CodecPick => r !== null) ?? null;
  if (chosen) writeCachedCodec(cacheKey, chosen);
  return chosen;
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
  const star =
    layers.star_markers && layers.star_labels
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
  // 8 labels ≈ 16–40ms of work on mobile, inside one animation-frame
  // budget. The old value (40) blocked the main thread for up to ~200ms
  // per chunk, which is what caused the UI jank during "preparing
  // export". Smaller chunks yield more often; `scheduler.yield()` makes
  // those yields cheap (no 4ms setTimeout floor).
  const CHUNK = 8;
  for (let i = 0; i < items.length; i += CHUNK) {
    if (signal?.aborted) return out;
    for (let k = i; k < Math.min(i + CHUNK, items.length); k++) {
      out.push(prerenderLabel(items[k]));
    }
    await yieldToMain();
  }
  return out;
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
  ...extra: (ImageBitmap | null | undefined)[]
): void {
  for (const arr of [labels.constellation, labels.star, labels.deepSky]) {
    for (const l of arr) l.bitmap.close?.();
  }
  for (const b of extra) b?.close?.();
}
