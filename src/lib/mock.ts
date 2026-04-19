import type { AnalyzeResponse, Catalog, OverlayOptions } from '@/types/api';
import type { PhaseId } from '@/state/store';

/**
 * Mock catalog entries used when the backend is unreachable. Names are left as
 * their English/Bayer-proper-noun forms so they read consistently regardless of
 * the active UI locale — the real API delivers locale-specific labels from
 * Stardroid / Stellarium tables when available.
 */
const MOCK_NAMED_STARS = [
  { id: 'sirius', name: 'Sirius', magnitude: -1.46, constellation: 'Canis Major' },
  { id: 'capella', name: 'Capella', magnitude: 0.08, constellation: 'Auriga' },
  { id: 'rigel', name: 'Rigel', magnitude: 0.18, constellation: 'Orion' },
  { id: 'betelgeuse', name: 'Betelgeuse', magnitude: 0.5, constellation: 'Orion' },
  { id: 'aldebaran', name: 'Aldebaran', magnitude: 0.85, constellation: 'Taurus' },
  { id: 'procyon', name: 'Procyon', magnitude: 0.34, constellation: 'Canis Minor' },
  { id: 'pollux', name: 'Pollux', magnitude: 1.14, constellation: 'Gemini' },
  { id: 'castor', name: 'Castor', magnitude: 1.58, constellation: 'Gemini' },
];

const MOCK_CONSTELLATIONS = [
  { id: 'orion', name: 'Orion', starCount: 18 },
  { id: 'taurus', name: 'Taurus', starCount: 14 },
  { id: 'gemini', name: 'Gemini', starCount: 12 },
  { id: 'auriga', name: 'Auriga', starCount: 9 },
  { id: 'canis-major', name: 'Canis Major', starCount: 8 },
  { id: 'canis-minor', name: 'Canis Minor', starCount: 4 },
  { id: 'monoceros', name: 'Monoceros', starCount: 6 },
];

const MOCK_DSO = [
  { id: 'm42', name: 'M42 · Orion Nebula', type: 'N', magnitude: 4.0 },
  { id: 'm45', name: 'M45 · Pleiades', type: 'OC', magnitude: 1.6 },
  { id: 'm35', name: 'M35', type: 'OC', magnitude: 5.3 },
  { id: 'm78', name: 'M78', type: 'RN', magnitude: 8.3 },
  { id: 'm1', name: 'M1 · Crab Nebula', type: 'SNR', magnitude: 8.4 },
  { id: 'ngc2264', name: 'NGC 2264 · Christmas Tree Cluster', type: 'OC', magnitude: 3.9 },
  { id: 'ngc2238', name: 'NGC 2238 · Rosette Nebula', type: 'N', magnitude: 9.0 },
];

interface MockOptions {
  signal?: AbortSignal;
  onProgress?: (phaseId: PhaseId, pct: number) => void;
}

const MOCK_PHASES: ReadonlyArray<{ id: PhaseId; durationMs: number }> = [
  { id: 'upload', durationMs: 280 },
  { id: 'extract', durationMs: 540 },
  { id: 'solve', durationMs: 940 },
  { id: 'match', durationMs: 620 },
  { id: 'finalize', durationMs: 380 },
] as const;

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trimByLimit<T>(items: T[], limit: number): T[] {
  if (limit <= 0) return [];
  return items.slice(0, limit);
}

const EMPTY_CATALOG: Catalog = {
  image_width: 0,
  image_height: 0,
  stars: [],
  constellations: [],
  dsos: [],
};

export async function mockAnalyze(
  inputUrl: string,
  options: OverlayOptions,
  { signal, onProgress }: MockOptions = {},
): Promise<AnalyzeResponse> {
  const totalDuration = MOCK_PHASES.reduce((acc, p) => acc + p.durationMs, 0);
  let elapsed = 0;
  const start = performance.now();

  for (const phase of MOCK_PHASES) {
    if (signal?.aborted) {
      throw new DOMException('Cancelled', 'AbortError');
    }
    onProgress?.(phase.id, elapsed / totalDuration);
    await wait(phase.durationMs, signal);
    elapsed += phase.durationMs;
    onProgress?.(phase.id, elapsed / totalDuration);
  }

  const stars = options.layers.star_labels
    ? trimByLimit(
        MOCK_NAMED_STARS.filter((s) => s.magnitude <= options.detail.star_magnitude_limit),
        options.detail.star_label_limit,
      )
    : [];

  const constellations = options.layers.constellation_labels
    ? options.layers.contextual_constellation_labels
      ? MOCK_CONSTELLATIONS
      : MOCK_CONSTELLATIONS.slice(0, 4)
    : [];

  const dsos = options.layers.deep_sky_markers
    ? trimByLimit(
        MOCK_DSO.filter((d) => d.magnitude <= options.detail.dso_magnitude_limit),
        options.detail.dso_label_limit,
      )
    : [];

  const baseField = 34.1;
  const wobble = (Math.random() - 0.5) * 0.6;

  return {
    processingMs: Math.round(performance.now() - start),
    inputImageUrl: inputUrl,
    solve: {
      center_ra_deg: clamp(0, 95.6 + wobble * 5, 360),
      center_dec_deg: clamp(-90, 12.4 + wobble * 3, 90),
      field_width_deg: baseField,
      field_height_deg: 23.8,
    },
    catalog: EMPTY_CATALOG,
    visible_named_stars: stars,
    visible_constellations: constellations,
    visible_deep_sky_objects: dsos,
  };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
