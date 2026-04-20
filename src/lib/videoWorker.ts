/// <reference lib="webworker" />
/**
 * Dedicated Worker that performs the entire video encode loop off the main
 * thread. Receives a single `start` message containing pre-baked assets
 * (photo + strip bitmaps, pre-rasterized labels, scene geometry, encoder
 * config) and streams progress + the final MP4 buffer back.
 *
 * Why a worker:
 *  - UI stays smooth while rendering (no jank on the dialog's progress bar).
 *  - The encode can push frames as fast as the hardware encoder will accept,
 *    no longer sharing a thread with framer-motion + React.
 *  - OffscreenCanvas + Canvas 2D + VideoEncoder + mp4-muxer are all
 *    available in the worker scope.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { OverlayOptions, OverlayScene } from '../types/api';
import {
  computeOverlayBuildInfo,
  drawOverlayFrame,
  type LabelBitmapBundle,
} from './videoFrame';

// ---------- Message contract (must stay in sync with videoExport.ts) ----------

export interface VideoWorkerStartMessage {
  type: 'start';
  photo: ImageBitmap;
  strip: ImageBitmap;
  scene: OverlayScene;
  layers: OverlayOptions['layers'];
  labels: LabelBitmapBundle;
  outW: number;
  outH: number;
  overlayW: number;
  overlayH: number;
  stripH: number;
  srcW: number;
  srcH: number;
  fps: number;
  bitrate: number;
  codec: string;
  /** Which codec family to tell mp4-muxer about. */
  codecFamily: 'avc' | 'hevc';
  /** Multiplier applied to all overlay stroke widths. */
  strokeBoost: number;
}

export interface VideoWorkerCancelMessage {
  type: 'cancel';
}

export type VideoWorkerInMessage = VideoWorkerStartMessage | VideoWorkerCancelMessage;

export type VideoWorkerOutMessage =
  | { type: 'progress'; pct: number }
  | { type: 'done'; buffer: ArrayBuffer; durationMs: number; width: number; height: number }
  | { type: 'error'; message: string; name?: string };

// ---------- Worker state ----------

const scope = self as unknown as DedicatedWorkerGlobalScope;
let cancelled = false;

scope.addEventListener('message', (event: MessageEvent<VideoWorkerInMessage>) => {
  const data = event.data;
  if (data.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (data.type === 'start') {
    void run(data).catch((err) => {
      postOut({
        type: 'error',
        message: (err as Error).message,
        name: (err as Error).name,
      });
    });
  }
});

function postOut(msg: VideoWorkerOutMessage, transfer?: Transferable[]): void {
  scope.postMessage(msg, transfer ?? []);
}

async function run(msg: VideoWorkerStartMessage): Promise<void> {
  const {
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
  } = msg;

  // --- 1. Pre-composite the static base (photo + strip) -----------------
  // Drawn into its own offscreen canvas ONCE, then blitted per frame.
  // Avoids re-scaling the photo every frame.
  const baseCanvas = new OffscreenCanvas(outW, outH);
  const baseCtx = baseCanvas.getContext('2d');
  if (!baseCtx) throw new Error('base ctx unavailable');
  baseCtx.imageSmoothingEnabled = true;
  baseCtx.imageSmoothingQuality = 'high';
  baseCtx.fillStyle = '#000';
  baseCtx.fillRect(0, 0, outW, outH);
  baseCtx.drawImage(msg.photo, 0, 0, overlayW, overlayH);
  baseCtx.drawImage(msg.strip, 0, overlayH, overlayW, stripH);
  const baseBitmap = baseCanvas.transferToImageBitmap();

  // --- 2. Frame canvas ---------------------------------------------------
  const frameCanvas = new OffscreenCanvas(outW, outH);
  const frameCtx = frameCanvas.getContext('2d', { alpha: false });
  if (!frameCtx) throw new Error('frame ctx unavailable');
  frameCtx.imageSmoothingEnabled = true;
  frameCtx.imageSmoothingQuality = 'high';

  // --- 3. Encoder + muxer -----------------------------------------------
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: codecFamily, width: outW, height: outH, frameRate: fps },
    fastStart: 'in-memory',
  });

  const encoderErrors: Error[] = [];
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => encoderErrors.push(err as Error),
  });
  const encoderConfig: VideoEncoderConfig = {
    codec,
    width: outW,
    height: outH,
    bitrate,
    framerate: fps,
    // Use constant bitrate when available — predictable file sizes and
    // evenly-distributed detail (no first-few-seconds quality dip).
    bitrateMode: 'constant',
    latencyMode: 'quality',
  };
  if (codecFamily === 'avc') {
    // mp4-muxer expects AVCC-formatted H.264 chunks.
    (encoderConfig as VideoEncoderConfig & { avc?: { format: 'avc' } }).avc = { format: 'avc' };
  } else {
    // Same for HEVC — hvcC bitstream format, not Annex-B.
    (encoderConfig as VideoEncoderConfig & { hevc?: { format: 'hevc' } }).hevc = { format: 'hevc' };
  }
  encoder.configure(encoderConfig);

  // --- 4. Timing ---------------------------------------------------------
  // Slow cinematic pacing: a longer photo fade-in, then the overlay builds
  // in, then the composition sits completely still for a beat before the
  // clip ends. There's no breathing / twinkling to watch during the hold.
  const introDuration = 1.0;
  const holdDuration = 2.0;
  const { buildEnd } = computeOverlayBuildInfo(msg.scene, msg.layers);
  const totalDuration = introDuration + buildEnd + holdDuration;
  const totalFrames = Math.max(1, Math.round(totalDuration * fps));
  const usPerFrame = Math.round(1_000_000 / fps);
  const keyEvery = fps * 2;

  // --- 5. Render + encode loop -------------------------------------------
  for (let i = 0; i < totalFrames; i++) {
    if (cancelled) {
      try { encoder.close(); } catch { /* ignore */ }
      throw new DOMException('Video export cancelled', 'AbortError');
    }

    const t = i / fps;
    renderFrame({
      ctx: frameCtx,
      t,
      introDuration,
      outW,
      outH,
      overlayW,
      overlayH,
      srcW,
      srcH,
      scene: msg.scene,
      layers: msg.layers,
      labels: msg.labels,
      base: baseBitmap,
      strokeBoost,
    });

    const frame = new VideoFrame(frameCanvas, {
      timestamp: i * usPerFrame,
      duration: usPerFrame,
    });
    encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
    frame.close();

    // Back-pressure so we don't overwhelm the encoder's internal queue.
    while (encoder.encodeQueueSize > 8) {
      await yieldToWorker();
    }

    postOut({ type: 'progress', pct: (i + 1) / totalFrames });
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();
  if (encoderErrors.length) throw encoderErrors[0];

  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  postOut(
    {
      type: 'done',
      buffer,
      durationMs: Math.round(totalDuration * 1000),
      width: outW,
      height: outH,
    },
    [buffer],
  );

  // Free the big static bitmap now that encoding is done.
  baseBitmap.close();
}

// ---------- Frame composition ----------

interface FrameRenderArgs {
  ctx: OffscreenCanvasRenderingContext2D;
  t: number;
  introDuration: number;
  outW: number;
  outH: number;
  overlayW: number;
  overlayH: number;
  srcW: number;
  srcH: number;
  scene: OverlayScene;
  layers: OverlayOptions['layers'];
  labels: LabelBitmapBundle;
  base: ImageBitmap;
  strokeBoost: number;
}

function renderFrame(a: FrameRenderArgs): void {
  const { ctx } = a;
  // Blit the static base 1:1. No zoom — ken-burns was the biggest source of
  // perceived blur because the base bitmap was being resampled every frame.
  ctx.drawImage(a.base, 0, 0);

  const introAlpha = clamp01(a.t / Math.max(0.001, a.introDuration));
  if (introAlpha < 1) {
    // Veil with a dissolving black overlay to fade the base in.
    ctx.save();
    ctx.globalAlpha = 1 - introAlpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, a.outW, a.outH);
    ctx.restore();
  }

  // Overlay — scene coords mapped onto the scaled photo area.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, a.overlayW, a.overlayH);
  ctx.clip();
  ctx.scale(a.overlayW / a.srcW, a.overlayH / a.srcH);
  const overlayT = Math.max(0, a.t - a.introDuration);
  drawOverlayFrame(ctx, overlayT, a.scene, a.layers, a.labels, a.strokeBoost);
  ctx.restore();
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function yieldToWorker(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
