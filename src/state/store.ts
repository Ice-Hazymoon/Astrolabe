import { create } from 'zustand';
import type { AnalyzeResponse, Locale, OverlayOptions, Preset } from '@/types/api';
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

interface UploadInput {
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
  /** Locale that produced `result`. Labels are localized server-side, so changing locale
   * triggers a re-analysis; layer/detail changes are applied live on the client. */
  resultLocale: Locale | null;
  progress: ProcessingProgress;
  error: string | null;
  history: HistoryEntry[];
  abortController: AbortController | null;

  setOptions(options: OverlayOptions): void;
  applyPreset(preset: Preset): void;
  toggleLayer(layer: keyof OverlayOptions['layers']): void;
  updateDetail<K extends keyof OverlayOptions['detail']>(
    key: K,
    value: OverlayOptions['detail'][K],
  ): void;
  setLocale(locale: Locale): void;

  refreshApi(): Promise<void>;

  acceptFile(file: File): Promise<void>;
  startAnalysis(): Promise<void>;
  reset(): void;
  cancel(): void;
  restoreFromHistory(entry: HistoryEntry): void;
  removeFromHistory(id: string): void;
  clearHistory(): void;
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
  const initialHistory = history.list();
  history.subscribe((entries) => set({ history: entries }));

  // Kick off the API probe immediately and keep state in sync. Guarded for SSR:
  // `probeApi` calls `fetch`, and we don't want the server / prerenderer to hit
  // the real backend during build. The client picks it up on first render.
  if (typeof window !== 'undefined') {
    void refreshApiStatus().then((status) => set({ apiStatus: status }));
  }

  return {
    phase: 'idle',
    options: DEFAULT_OPTIONS,
    locale: DEFAULT_LOCALE,
    apiStatus: getApiStatus(),
    current: null,
    result: null,
    resultLocale: null,
    progress: { phaseId: 'ready', pct: 0 },
    error: null,
    history: initialHistory,
    abortController: null,

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
          inputDataUrl,
          inputDisplayUrl: inputBlobUrl,
          fileName: file.name,
          blob: file,
        },
        result: null,
        error: null,
        abortController: null,
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
          resultLocale: requestLocale,
          progress: { phaseId: 'done', pct: 1 },
          abortController: null,
        });
      } catch (err) {
        if (isStale()) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          set({ phase: 'preview', abortController: null });
          return;
        }
        const status = getApiStatus();
        set({
          phase: 'error',
          error: 'generation_failed',
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
        resultLocale: null,
        error: null,
        progress: { phaseId: 'ready', pct: 0 },
        abortController: null,
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
          inputDataUrl: entry.inputDataUrl,
          inputDisplayUrl: entry.inputDataUrl,
          fileName: entry.fileName,
          blob: new Blob(),
        },
        result: entry.result,
        resultLocale: (entry.result.resolvedLocale as Locale | undefined) ?? get().locale,
        options: entry.options,
        error: null,
        progress: { phaseId: 'restored', pct: 1 },
        abortController: null,
      });
    },

    removeFromHistory(id) {
      history.remove(id);
    },

    clearHistory() {
      history.clear();
    },
  };
});
