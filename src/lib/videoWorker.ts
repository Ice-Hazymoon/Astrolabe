/// <reference lib="webworker" />
/**
 * Encoder-only worker. Sets up `VideoEncoder` + `mp4-muxer`, receives
 * rendered `ImageBitmap`s keyed by frame index from the main thread,
 * encodes them in sequential order, and streams the finished MP4 buffer
 * back. All rendering lives in `videoRenderWorker.ts`; the main thread
 * shuttles bitmaps between them.
 *
 * Why a dedicated encoder worker (rather than encoding on one of the
 * render workers): keeping all render workers symmetric — same code, no
 * "worker 0 is special" asymmetry — is simpler, and isolating the encoder
 * means encoder backpressure never has to compete with render scheduling
 * inside a single worker's microtask queue.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// ---------- Message contract (must stay in sync with videoExport.ts) ----------

export interface VideoWorkerInitMessage {
  type: 'init';
  outW: number;
  outH: number;
  fps: number;
  bitrate: number;
  codec: string;
  /** Which codec family to tell mp4-muxer about. */
  codecFamily: 'avc' | 'hevc';
  totalFrames: number;
  /** Insert a keyframe every N frames (callers choose, typically fps*2). */
  keyEvery: number;
  /** Microseconds per frame — constant, precomputed for timestamp math. */
  usPerFrame: number;
  /** Authoritative video duration, independent of encoder rounding. */
  durationMs: number;
}

export interface VideoWorkerFrameMessage {
  type: 'frame';
  idx: number;
  bitmap: ImageBitmap;
}

export interface VideoWorkerCancelMessage {
  type: 'cancel';
}

export type VideoWorkerInMessage =
  | VideoWorkerInitMessage
  | VideoWorkerFrameMessage
  | VideoWorkerCancelMessage;

export interface TimingEntry {
  stage: string;
  t: number;
}

export type VideoWorkerOutMessage =
  | { type: 'progress'; pct: number }
  /** Emitted after each frame is accepted into the encoder — the main
   * thread turns this into an 'ack' back to the producing render worker
   * so render throughput is rate-limited by encoder throughput. */
  | { type: 'encoded'; idx: number }
  | {
      type: 'done';
      buffer: ArrayBuffer;
      durationMs: number;
      width: number;
      height: number;
      timings: TimingEntry[];
      framesEncoded: number;
    }
  | { type: 'error'; message: string; name?: string };

// ---------- Worker state ----------

const scope = self as unknown as DedicatedWorkerGlobalScope;

class WorkerTimings {
  private readonly t0 = performance.now();
  private readonly entries: TimingEntry[] = [];
  mark(stage: string): void {
    this.entries.push({ stage, t: performance.now() - this.t0 });
  }
  toArray(): TimingEntry[] {
    return this.entries.slice();
  }
}

// Set by the 'init' message. All subsequent state is initialised inside
// setup(); before that point everything is null.
let cancelled = false;
let config: VideoWorkerInitMessage | null = null;
let encoder: VideoEncoder | null = null;
let muxer: Muxer<ArrayBufferTarget> | null = null;
const encoderErrors: Error[] = [];
const T = new WorkerTimings();

/** Out-of-order frames arrive as render workers finish each stripe in
 * parallel. We buffer by index and drain in strict order since encode()
 * has temporal dependencies (key-frame scheduling, delta compression). */
const pendingFrames = new Map<number, ImageBitmap>();
let nextEncodeIdx = 0;
let framesEncoded = 0;
let isDraining = false;
let finalized = false;

scope.addEventListener('message', (event: MessageEvent<VideoWorkerInMessage>) => {
  const data = event.data;
  if (data.type === 'cancel') {
    cancelled = true;
    tryAbort();
    return;
  }
  if (data.type === 'init') {
    try {
      setup(data);
    } catch (err) {
      postErr(err);
    }
    return;
  }
  if (data.type === 'frame') {
    if (cancelled || finalized) {
      // Drop stragglers — we're winding down.
      data.bitmap.close();
      return;
    }
    pendingFrames.set(data.idx, data.bitmap);
    void drain();
    return;
  }
});

function postOut(msg: VideoWorkerOutMessage, transfer?: Transferable[]): void {
  scope.postMessage(msg, transfer ?? []);
}

function postErr(err: unknown): void {
  postOut({
    type: 'error',
    message: (err as Error).message ?? String(err),
    name: (err as Error).name,
  });
}

function setup(init: VideoWorkerInitMessage): void {
  T.mark('worker:start');
  config = init;

  muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: init.codecFamily,
      width: init.outW,
      height: init.outH,
      frameRate: init.fps,
    },
    fastStart: 'in-memory',
  });

  encoder = new VideoEncoder({
    output: (chunk, meta) => muxer?.addVideoChunk(chunk, meta),
    error: (err) => encoderErrors.push(err as Error),
  });
  const encoderConfig: VideoEncoderConfig = {
    codec: init.codec,
    width: init.outW,
    height: init.outH,
    bitrate: init.bitrate,
    framerate: init.fps,
    bitrateMode: 'constant',
    latencyMode: 'quality',
    hardwareAcceleration: 'prefer-hardware',
  };
  if (init.codecFamily === 'avc') {
    (encoderConfig as VideoEncoderConfig & { avc?: { format: 'avc' } }).avc = { format: 'avc' };
  } else {
    (encoderConfig as VideoEncoderConfig & { hevc?: { format: 'hevc' } }).hevc = { format: 'hevc' };
  }
  encoder.configure(encoderConfig);
  T.mark('encoder-configured');
}

/**
 * Consume in-order frames from `pendingFrames` until either (a) the next
 * index hasn't arrived yet, or (b) the encoder's internal queue is full
 * and we need to yield. Re-entrancy-safe via `isDraining`: if a 'frame'
 * message arrives while a drain is suspended on a yield, we just add to
 * the pending map and the existing drain picks it up on the next loop.
 */
async function drain(): Promise<void> {
  if (isDraining || !encoder || !config) return;
  isDraining = true;
  try {
    while (!cancelled && pendingFrames.has(nextEncodeIdx)) {
      // Respect encoder backpressure: VideoEncoder's internal queue above
      // ~8 means the hardware path is saturated, yielding keeps us from
      // piling chunks into the codec thread's buffer (and on some
      // browsers, prevents out-of-memory during long exports).
      while (encoder.encodeQueueSize > 8) {
        await yieldToWorker();
        if (cancelled) return;
      }

      const idx = nextEncodeIdx;
      const bitmap = pendingFrames.get(idx)!;
      pendingFrames.delete(idx);

      const frame = new VideoFrame(bitmap, {
        timestamp: idx * config.usPerFrame,
        duration: config.usPerFrame,
      });
      encoder.encode(frame, { keyFrame: idx % config.keyEvery === 0 });
      frame.close();
      bitmap.close();

      nextEncodeIdx++;
      framesEncoded++;

      // Rate-limit render workers: main thread uses this to hand out an
      // 'ack' to whichever render worker produced this idx, unblocking
      // its next stripe step.
      postOut({ type: 'encoded', idx });
      postOut({ type: 'progress', pct: framesEncoded / config.totalFrames });

      if (framesEncoded === config.totalFrames) {
        await finalize();
        return;
      }
    }
  } catch (err) {
    postErr(err);
  } finally {
    isDraining = false;
  }
}

async function finalize(): Promise<void> {
  if (finalized || !encoder || !muxer || !config) return;
  finalized = true;
  T.mark('render-loop-done');
  await encoder.flush();
  encoder.close();
  muxer.finalize();
  T.mark('encoder-flushed');
  if (encoderErrors.length) {
    postErr(encoderErrors[0]);
    return;
  }
  const buffer = muxer.target.buffer;
  postOut(
    {
      type: 'done',
      buffer,
      durationMs: config.durationMs,
      width: config.outW,
      height: config.outH,
      timings: T.toArray(),
      framesEncoded,
    },
    [buffer],
  );
}

function tryAbort(): void {
  // Release any bitmaps still sitting in the pending map.
  for (const bmp of pendingFrames.values()) bmp.close();
  pendingFrames.clear();
  try { encoder?.close(); } catch { /* ignore */ }
  postErr(new DOMException('Video export cancelled', 'AbortError'));
}

function yieldToWorker(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
