import { create } from 'zustand';
import type { AnalyzeResponse, Locale, OverlayOptions, Preset } from '@/types/api';
import { AnalyzeError } from '@/lib/api';
import { DEFAULT_LOCALE, DEFAULT_OPTIONS, PRESETS } from '@/data/defaults';
import { analyze, getApiStatus, refreshApiStatus, type ApiStatus } from '@/lib/analyze';
import { fileToDataUrl, history, makeThumbnail, type HistoryEntry } from '@/lib/storage';

export type Phase = 'idle' | 'preview' | 'processing' | 'result' | 'error';

/** Processing-pipeline step identifiers. Components resolve the i18n string from this key. */
export type PhaseId = 'ready' | 'preparing' | 'upload' | 'extract' | 'solve' | 'match' | 'finalize' | 'done' | 'restored';

export interface ProcessingProgress {
  phaseId: PhaseId;
  pct: number;
}

/** Per-item visibility filter state for the details sheet. Keys mirror the
 * stable ids attached to overlay markers/labels so per-row hide/solo can
 * affect the rendered object exactly instead of heuristically. */
export type DetailsCategory = 'stars' | 'constellations' | 'dsos';

export interface DetailsFilters {
  starsHidden: Set<string>;
  starSolo: string | null;
  constellationsHidden: Set<string>;
  constellationSolo: string | null;
  dsosHidden: Set<string>;
  dsoSolo: string | null;
}

const EMPTY_FILTERS: DetailsFilters = {
  starsHidden: new Set<string>(),
  starSolo: null,
  constellationsHidden: new Set<string>(),
  constellationSolo: null,
  dsosHidden: new Set<string>(),
  dsoSolo: null,
};

function cloneFilters(f: DetailsFilters): DetailsFilters {
  return {
    starsHidden: new Set(f.starsHidden),
    starSolo: f.starSolo,
    constellationsHidden: new Set(f.constellationsHidden),
    constellationSolo: f.constellationSolo,
    dsosHidden: new Set(f.dsosHidden),
    dsoSolo: f.dsoSolo,
  };
}

export function detailsFiltersActive(f: DetailsFilters): boolean {
  return (
    f.starsHidden.size > 0 ||
    f.starSolo !== null ||
    f.constellationsHidden.size > 0 ||
    f.constellationSolo !== null ||
    f.dsosHidden.size > 0 ||
    f.dsoSolo !== null
  );
}

export function detailsCategoryActive(f: DetailsFilters, category: DetailsCategory): boolean {
  switch (category) {
    case 'stars':
      return f.starsHidden.size > 0 || f.starSolo !== null;
    case 'constellations':
      return f.constellationsHidden.size > 0 || f.constellationSolo !== null;
    case 'dsos':
      return f.dsosHidden.size > 0 || f.dsoSolo !== null;
  }
}

interface UploadInput {
  /** Stable identity for the currently displayed source image. */
  sourceKey: string;
  /** data: URL — used for thumbnailing, history persistence, and as a display fallback. */
  inputDataUrl: string;
  /** Best URL for live display in <img>. blob: URL when freshly uploaded, otherwise = inputDataUrl. */
  inputDisplayUrl: string;
  fileName?: string;
  blob: Blob;
}

function releaseInputUrl(input: UploadInput | null): void {
  if (!input) return;
  if (input.inputDisplayUrl !== input.inputDataUrl && input.inputDisplayUrl.startsWith('blob:')) {
    URL.revokeObjectURL(input.inputDisplayUrl);
  }
}

interface SkyState {
  phase: Phase;
  options: OverlayOptions;
  locale: Locale;
  apiStatus: ApiStatus;
  current: UploadInput | null;
  result: AnalyzeResponse | null;
  progress: ProcessingProgress;
  error: string | null;
  history: HistoryEntry[];
  abortController: AbortController | null;
  /** Per-item visibility filters for the details sheet. Reset automatically whenever
   * `result` changes (new analysis or history restore). */
  detailsFilters: DetailsFilters;

  setOptions(options: OverlayOptions): void;
  applyPreset(preset: Preset): void;
  toggleLayer(layer: keyof OverlayOptions['layers']): void;
  updateDetail<K extends keyof OverlayOptions['detail']>(
    key: K,
    value: OverlayOptions['detail'][K],
  ): void;
  setLocale(locale: Locale): void;
  hydrateHistory(entries?: HistoryEntry[]): void;

  refreshApi(): Promise<void>;

  acceptFile(file: File): Promise<void>;
  startAnalysis(): Promise<void>;
  reset(): void;
  cancel(): void;
  restoreFromHistory(entry: HistoryEntry): void;
  removeFromHistory(id: string): void;
  clearHistory(): void;

  toggleItemHidden(category: DetailsCategory, id: string): void;
  toggleItemSolo(category: DetailsCategory, id: string): void;
  clearCategoryFilters(category: DetailsCategory): void;
  clearAllFilters(): void;
}

function presetMatches(options: OverlayOptions, preset: Preset): boolean {
  const target = PRESETS[preset];
  return (
    JSON.stringify(target.layers) === JSON.stringify(options.layers) &&
    JSON.stringify(target.detail) === JSON.stringify(options.detail)
  );
}

function inferPreset(options: OverlayOptions): Preset {
  for (const preset of ['balanced', 'detailed', 'max'] as const) {
    if (presetMatches(options, preset)) return preset;
  }
  return options.preset;
}

export const useSky = create<SkyState>((set, get) => {
  return {
    phase: 'idle',
    options: DEFAULT_OPTIONS,
    locale: DEFAULT_LOCALE,
    apiStatus: getApiStatus(),
    current: null,
    result: null,
    progress: { phaseId: 'ready', pct: 0 },
    error: null,
    history: [],
    abortController: null,
    detailsFilters: cloneFilters(EMPTY_FILTERS),

    setOptions(options) {
      set({ options: { ...options, preset: inferPreset(options) } });
    },

    applyPreset(preset) {
      set({ options: PRESETS[preset] });
    },

    toggleLayer(layer) {
      const opts = get().options;
      const next: OverlayOptions = {
        ...opts,
        layers: { ...opts.layers, [layer]: !opts.layers[layer] },
      };
      set({ options: { ...next, preset: inferPreset(next) } });
    },

    updateDetail(key, value) {
      const opts = get().options;
      const next: OverlayOptions = {
        ...opts,
        detail: { ...opts.detail, [key]: value },
      };
      set({ options: { ...next, preset: inferPreset(next) } });
    },

    setLocale(locale) {
      set({ locale });
    },

    hydrateHistory(entries = history.list()) {
      set({ history: entries });
    },

    async refreshApi() {
      const status = await refreshApiStatus();
      set({ apiStatus: status });
    },

    async acceptFile(file) {
      get().abortController?.abort();
      // Release the previous input's blob URL before we replace it.
      releaseInputUrl(get().current);
      // Read the file as a data URL in parallel with creating a fast blob URL for display.
      // Browsers handle blob: URLs in <img> faster and more reliably than multi-MB data: URLs.
      const inputBlobUrl = URL.createObjectURL(file);
      const inputDataUrl = await fileToDataUrl(file);
      set({
        phase: 'preview',
        current: {
          sourceKey: `upload:${file.name}:${file.size}:${file.lastModified}`,
          inputDataUrl,
          inputDisplayUrl: inputBlobUrl,
          fileName: file.name,
          blob: file,
        },
        result: null,
        error: null,
        abortController: null,
        detailsFilters: cloneFilters(EMPTY_FILTERS),
      });
    },

    async startAnalysis() {
      const initial = get();
      if (!initial.current) return;

      initial.abortController?.abort();
      const controller = new AbortController();
      const input = initial.current;
      const requestOptions = initial.options;
      const requestLocale = initial.locale;

      set({
        phase: 'processing',
        progress: { phaseId: 'preparing', pct: 0 },
        error: null,
        abortController: controller,
      });

      const isStale = () => get().abortController !== controller;

      try {
        const response = await analyze({
          file: input.blob,
          inputDataUrl: input.inputDataUrl,
          options: requestOptions,
          locale: requestLocale,
          signal: controller.signal,
          onProgress: (phaseId, pct) => {
            if (!isStale()) set({ progress: { phaseId, pct } });
          },
        });

        if (isStale()) return;

        // Sync API status from whatever the dispatcher saw last.
        const status = getApiStatus();
        if (status !== get().apiStatus) set({ apiStatus: status });

        const thumb = await makeThumbnail(input.inputDataUrl).catch(() => input.inputDataUrl);
        if (isStale()) return;

        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          thumbDataUrl: thumb,
          inputDataUrl: input.inputDataUrl,
          options: requestOptions,
          result: response,
          fileName: input.fileName,
        };
        history.push(entry);

        set({
          phase: 'result',
          result: response,
          progress: { phaseId: 'done', pct: 1 },
          abortController: null,
          detailsFilters: cloneFilters(EMPTY_FILTERS),
        });
      } catch (err) {
        if (isStale()) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          set({ phase: 'preview', abortController: null });
          return;
        }
        const status = getApiStatus();
        const errorCode = err instanceof AnalyzeError ? err.code : 'generation_failed';
        set({
          phase: 'error',
          error: errorCode,
          apiStatus: status,
          abortController: null,
        });
      }
    },

    reset() {
      get().abortController?.abort();
      releaseInputUrl(get().current);
      set({
        phase: 'idle',
        current: null,
        result: null,
        error: null,
        progress: { phaseId: 'ready', pct: 0 },
        abortController: null,
        detailsFilters: cloneFilters(EMPTY_FILTERS),
      });
    },

    cancel() {
      get().abortController?.abort();
    },

    restoreFromHistory(entry) {
      get().abortController?.abort();
      releaseInputUrl(get().current);
      set({
        phase: 'result',
        // Restored entries don't have the original blob, so we display the data URL directly.
        current: {
          sourceKey: `history:${entry.id}`,
          inputDataUrl: entry.inputDataUrl,
          inputDisplayUrl: entry.inputDataUrl,
          fileName: entry.fileName,
          blob: new Blob(),
        },
        result: entry.result,
        options: entry.options,
        error: null,
        progress: { phaseId: 'restored', pct: 1 },
        abortController: null,
        detailsFilters: cloneFilters(EMPTY_FILTERS),
      });
    },

    removeFromHistory(id) {
      history.remove(id);
    },

    clearHistory() {
      history.clear();
    },

    toggleItemHidden(category, id) {
      const next = cloneFilters(get().detailsFilters);
      const hidden =
        category === 'stars'
          ? next.starsHidden
          : category === 'constellations'
            ? next.constellationsHidden
            : next.dsosHidden;
      if (hidden.has(id)) hidden.delete(id);
      else hidden.add(id);
      // Un-hiding a solo'd item shouldn't clear solo — they're independent axes.
      // But if you just hid the item that was soloed, drop the solo so the UI
      // doesn't end up in the contradictory "solo X + hide X = nothing visible" state.
      if (category === 'stars' && hidden.has(id) && next.starSolo === id) next.starSolo = null;
      if (category === 'constellations' && hidden.has(id) && next.constellationSolo === id)
        next.constellationSolo = null;
      if (category === 'dsos' && hidden.has(id) && next.dsoSolo === id) next.dsoSolo = null;
      set({ detailsFilters: next });
    },

    toggleItemSolo(category, id) {
      const next = cloneFilters(get().detailsFilters);
      if (category === 'stars') {
        next.starSolo = next.starSolo === id ? null : id;
        next.constellationSolo = null;
        next.dsoSolo = null;
        // Soloing an item that was hidden is almost certainly an explicit intent
        // to see it — clear its hidden flag so the solo actually shows something.
        if (next.starSolo === id) next.starsHidden.delete(id);
      } else if (category === 'constellations') {
        next.constellationSolo = next.constellationSolo === id ? null : id;
        next.starSolo = null;
        next.dsoSolo = null;
        if (next.constellationSolo === id) next.constellationsHidden.delete(id);
      } else {
        next.dsoSolo = next.dsoSolo === id ? null : id;
        next.starSolo = null;
        next.constellationSolo = null;
        if (next.dsoSolo === id) next.dsosHidden.delete(id);
      }
      set({ detailsFilters: next });
    },

    clearCategoryFilters(category) {
      const next = cloneFilters(get().detailsFilters);
      if (category === 'stars') {
        next.starsHidden = new Set();
        next.starSolo = null;
      } else if (category === 'constellations') {
        next.constellationsHidden = new Set();
        next.constellationSolo = null;
      } else {
        next.dsosHidden = new Set();
        next.dsoSolo = null;
      }
      set({ detailsFilters: next });
    },

    clearAllFilters() {
      set({ detailsFilters: cloneFilters(EMPTY_FILTERS) });
    },
  };
});
