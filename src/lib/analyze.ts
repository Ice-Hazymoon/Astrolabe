import type { AnalyzeResponse, Locale, OverlayOptions } from '@/types/api';
import type { PhaseId } from '@/state/store';
import { analyzeViaApi, probeApi } from './api';
import { mockAnalyze } from './mock';

export type ApiStatus = 'unknown' | 'online' | 'offline';

interface AnalyzeArgs {
  file: Blob;
  inputDataUrl: string;
  options: OverlayOptions;
  locale: Locale;
  signal?: AbortSignal;
  onProgress?: (phaseId: PhaseId, pct: number) => void;
  /** Force a specific source. Useful for tests / dev toggles. */
  force?: 'api' | 'mock';
}

let cachedStatus: ApiStatus = 'unknown';
let inFlightProbe: Promise<ApiStatus> | null = null;

export function getApiStatus(): ApiStatus {
  return cachedStatus;
}

export async function refreshApiStatus(): Promise<ApiStatus> {
  if (inFlightProbe) return inFlightProbe;
  inFlightProbe = probeApi()
    .then((ok) => {
      cachedStatus = ok ? 'online' : 'offline';
      return cachedStatus;
    })
    .catch(() => {
      cachedStatus = 'offline';
      return cachedStatus;
    })
    .finally(() => {
      inFlightProbe = null;
    });
  return inFlightProbe;
}

/**
 * Phase progress for the real API call. Since the backend doesn't stream phase events,
 * we drive a smooth synthetic progress curve while we wait. Phase IDs are translated in UI.
 */
const REAL_PHASES: ReadonlyArray<{ id: PhaseId; target: number }> = [
  { id: 'upload', target: 0.18 },
  { id: 'extract', target: 0.4 },
  { id: 'solve', target: 0.65 },
  { id: 'match', target: 0.88 },
  { id: 'finalize', target: 0.97 },
] as const;

export async function analyze(args: AnalyzeArgs): Promise<AnalyzeResponse> {
  const { file, inputDataUrl, options, locale, signal, onProgress, force } = args;

  const useMock = force === 'mock' || (force !== 'api' && cachedStatus === 'offline');

  if (useMock) {
    return mockAnalyze(inputDataUrl, options, { signal, onProgress });
  }

  // Drive the synthetic phase ticker for the real call.
  const ticker = startPhaseTicker(onProgress, signal);

  try {
    const response = await analyzeViaApi({ file, locale, signal });
    ticker.complete();
    return response;
  } catch (err) {
    ticker.cancel();
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Real call failed (network error, server down) — mark offline and fall back to mock so the
    // user gets a usable result with feedback rather than a hard failure.
    cachedStatus = 'offline';
    return mockAnalyze(inputDataUrl, options, { signal, onProgress });
  }
}

function startPhaseTicker(
  onProgress: AnalyzeArgs['onProgress'],
  signal: AbortSignal | undefined,
): { complete(): void; cancel(): void } {
  if (!onProgress) return { complete() {}, cancel() {} };

  let phase = 0;
  let cancelled = false;
  onProgress(REAL_PHASES[0].id, 0.04);

  const tick = () => {
    if (cancelled || signal?.aborted) return;
    if (phase < REAL_PHASES.length) {
      const { id, target } = REAL_PHASES[phase];
      onProgress(id, target);
      phase += 1;
      window.setTimeout(tick, 600 + Math.random() * 600);
    }
  };
  window.setTimeout(tick, 280);

  return {
    complete() {
      cancelled = true;
      onProgress(REAL_PHASES[REAL_PHASES.length - 1].id, 1);
    },
    cancel() {
      cancelled = true;
    },
  };
}
