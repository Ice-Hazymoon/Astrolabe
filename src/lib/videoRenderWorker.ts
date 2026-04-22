/// <reference lib="webworker" />
/**
 * Render-only worker. Owns a base canvas, frame canvas, and cumulative
 * overlay cache, and produces ImageBitmaps for an assigned stripe of
 * frames (`idx` where `idx % stride === offset`). Bitmaps are transferred
 * back to the main thread, which forwards them to the encoder worker in
 * index order.
 *
 * Parallelism comes from running N of these side-by-side. Stripes are
 * interleaved (mod-N) rather than contiguous so every worker sees a
 * balanced mix of heavy build frames and cheap hold-tail frames — the
 * alternative (contiguous ranges) would leave the worker holding the
 * build phase as the single bottleneck.
 *
 * Each worker maintains its own progressive layer cache and its own hold
 * bitmap. The cost of re-baking layers N times (once per worker) is a
 * couple of extra overlay passes total — negligible compared to the
 * multi-core speedup on the heavy live-render frames.
 */

import type { OverlayOptions, OverlayScene } from '../types/api';
import {
  drawOverlayFrame,
  planOverlayLayers,
  type LabelBitmapBundle,
  type OverlayLayerId,
} from './videoFrame';

// ---------- Message contract (mirrors main-thread coordinator) ----------

export interface VideoRenderWorkerInitMessage {
  type: 'init';
  photo: ImageBitmap;
  strip: ImageBitmap | null;
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
  strokeBoost: number;
  introDuration: number;
  buildEnd: number;
  totalFrames: number;
  /** 0..stride-1 — which residue class of frames this worker owns. */
  stripeOffset: number;
  /** Pool size; frames where `i % stride === stripeOffset` are ours. */
  stripeStride: number;
  /** Max in-flight frames this worker may post without an ack back. */
  inFlightWindow: number;
}

export interface VideoRenderWorkerAckMessage {
  type: 'ack';
}

export interface VideoRenderWorkerCancelMessage {
  type: 'cancel';
}

export type VideoRenderWorkerInMessage =
  | VideoRenderWorkerInitMessage
  | VideoRenderWorkerAckMessage
  | VideoRenderWorkerCancelMessage;

export type VideoRenderWorkerOutMessage =
  | { type: 'frame'; idx: number; bitmap: ImageBitmap }
  | { type: 'done' }
  | { type: 'error'; message: string; name?: string };

// ---------- Worker state ----------

const scope = self as unknown as DedicatedWorkerGlobalScope;
let cancelled = false;
// Pending ack resolvers, drained in FIFO order. Render produces bitmaps
// faster than the encoder typically consumes them; this gates production
// so memory stays bounded at `inFlightWindow * bitmap-size`.
const ackResolvers: Array<() => void> = [];

scope.addEventListener('message', (event: MessageEvent<VideoRenderWorkerInMessage>) => {
  const data = event.data;
  if (data.type === 'cancel') {
    cancelled = true;
    // Release anyone awaiting an ack so the loop can observe `cancelled`.
    while (ackResolvers.length) ackResolvers.shift()?.();
    return;
  }
  if (data.type === 'ack') {
    ackResolvers.shift()?.();
    return;
  }
  if (data.type === 'init') {
    void run(data).catch((err) => {
      postOut({
        type: 'error',
        message: (err as Error).message,
        name: (err as Error).name,
      });
    });
  }
});

function postOut(msg: VideoRenderWorkerOutMessage, transfer?: Transferable[]): void {
  scope.postMessage(msg, transfer ?? []);
}

function waitForAck(): Promise<void> {
  return new Promise((resolve) => ackResolvers.push(resolve));
}

async function run(msg: VideoRenderWorkerInitMessage): Promise<void> {
  const {
    outW, outH, overlayW, overlayH, stripH, srcW, srcH, fps, strokeBoost,
    introDuration, buildEnd, totalFrames,
    stripeOffset, stripeStride, inFlightWindow,
  } = msg;

  // --- Pre-composite static base (photo + optional strip) ---------------
  const baseCanvas = new OffscreenCanvas(outW, outH);
  const baseCtx = baseCanvas.getContext('2d');
  if (!baseCtx) throw new Error('base ctx unavailable');
  baseCtx.imageSmoothingEnabled = true;
  baseCtx.imageSmoothingQuality = 'high';
  baseCtx.fillStyle = '#000';
  baseCtx.fillRect(0, 0, outW, outH);
  baseCtx.drawImage(msg.photo, 0, 0, overlayW, overlayH);
  if (msg.strip && stripH > 0) {
    baseCtx.drawImage(msg.strip, 0, overlayH, overlayW, stripH);
  }
  const baseBitmap = baseCanvas.transferToImageBitmap();
  msg.photo.close();
  msg.strip?.close();

  // --- Frame canvas & overlay cache -------------------------------------
  const frameCanvas = new OffscreenCanvas(outW, outH);
  const frameCtx = frameCanvas.getContext('2d', { alpha: false });
  if (!frameCtx) throw new Error('frame ctx unavailable');
  frameCtx.imageSmoothingEnabled = true;
  frameCtx.imageSmoothingQuality = 'high';

  const overlayCacheCanvas = new OffscreenCanvas(overlayW, overlayH);
  const overlayCacheCtx = overlayCacheCanvas.getContext('2d');
  if (!overlayCacheCtx) throw new Error('overlay cache ctx unavailable');
  overlayCacheCtx.lineCap = 'round';
  overlayCacheCtx.lineJoin = 'round';

  // --- Progressive bake state -------------------------------------------
  const plan = planOverlayLayers(msg.scene, msg.layers);
  const bakedSet = new Set<OverlayLayerId>();
  let nextBakeIdx = 0;
  const liveFilter = (id: OverlayLayerId): boolean => !bakedSet.has(id);

  // --- Hold tail: each worker captures its own settled frame once ------
  const holdStartFrame = Math.ceil((introDuration + buildEnd) * fps);
  let holdBitmap: ImageBitmap | null = null;

  let inFlight = 0;

  // Walk the stripe in frame-index order. `stripeOffset` is our residue
  // class; `stripeStride` is N. Keeps progressive-cache advancement
  // monotonic since our own overlayT values still increase frame by frame.
  for (let i = stripeOffset; i < totalFrames; i += stripeStride) {
    if (cancelled) throw new DOMException('render cancelled', 'AbortError');

    let outBitmap: ImageBitmap;

    if (holdBitmap && i > holdStartFrame) {
      // Hold tail: draw the captured frame onto our canvas and transfer.
      // createImageBitmap(holdBitmap) would work too but transferToImageBitmap
      // reuses the canvas's backing store, avoiding an extra allocation.
      frameCtx.drawImage(holdBitmap, 0, 0);
      outBitmap = frameCanvas.transferToImageBitmap();
    } else {
      const overlayT = i / fps - introDuration;

      // Advance baking in draw order. Later layers wait until all earlier
      // layers are baked — see videoWorker.ts's cache comments for the
      // compositing-order reasoning.
      if (nextBakeIdx < plan.length && overlayT >= plan[nextBakeIdx].endTime) {
        overlayCacheCtx.save();
        overlayCacheCtx.beginPath();
        overlayCacheCtx.rect(0, 0, overlayW, overlayH);
        overlayCacheCtx.clip();
        overlayCacheCtx.scale(overlayW / srcW, overlayH / srcH);
        while (nextBakeIdx < plan.length && overlayT >= plan[nextBakeIdx].endTime) {
          const layerId = plan[nextBakeIdx].id;
          drawOverlayFrame(
            overlayCacheCtx, overlayT, msg.scene, msg.layers, msg.labels, strokeBoost,
            (id) => id === layerId,
          );
          bakedSet.add(layerId);
          nextBakeIdx++;
        }
        overlayCacheCtx.restore();
      }

      // Render into frame canvas (base + intro + cache + live layers).
      frameCtx.drawImage(baseBitmap, 0, 0);
      const introAlpha = clamp01(i / fps / Math.max(0.001, introDuration));
      if (introAlpha < 1) {
        frameCtx.save();
        frameCtx.globalAlpha = 1 - introAlpha;
        frameCtx.fillStyle = '#000';
        frameCtx.fillRect(0, 0, outW, outH);
        frameCtx.restore();
      }
      if (overlayT > 0) {
        if (nextBakeIdx > 0) {
          frameCtx.drawImage(overlayCacheCanvas, 0, 0);
        }
        if (nextBakeIdx < plan.length) {
          frameCtx.save();
          frameCtx.beginPath();
          frameCtx.rect(0, 0, overlayW, overlayH);
          frameCtx.clip();
          frameCtx.scale(overlayW / srcW, overlayH / srcH);
          drawOverlayFrame(
            frameCtx, overlayT, msg.scene, msg.layers, msg.labels, strokeBoost,
            liveFilter,
          );
          frameCtx.restore();
        }
      }

      if (!holdBitmap && i >= holdStartFrame) {
        // First fully-settled frame IN THIS STRIPE — not every worker's
        // stripe contains `holdStartFrame` exactly (mod-N partitioning),
        // so we capture on the first stripe index that reaches the
        // settled region. Snapshot before the transferToImageBitmap
        // below empties the canvas.
        holdBitmap = await createImageBitmap(frameCanvas);
      }
      outBitmap = frameCanvas.transferToImageBitmap();
    }

    postOut({ type: 'frame', idx: i, bitmap: outBitmap }, [outBitmap]);
    inFlight++;

    // Backpressure: don't outrun what the encoder has accepted. Keep at
    // most `inFlightWindow` frames unacknowledged so our message-queue
    // footprint is bounded at window * bitmap-size bytes.
    while (inFlight >= inFlightWindow) {
      await waitForAck();
      inFlight--;
      if (cancelled) throw new DOMException('render cancelled', 'AbortError');
    }
  }

  // Drain remaining acks so the coordinator knows we're idle before
  // the encoder sees all frames.
  while (inFlight > 0) {
    await waitForAck();
    inFlight--;
  }

  postOut({ type: 'done' });
  baseBitmap.close();
  holdBitmap?.close();
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
