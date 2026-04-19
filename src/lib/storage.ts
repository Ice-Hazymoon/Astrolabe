import type { AnalyzeResponse, OverlayOptions } from '@/types/api';

const STORAGE_KEY = 'stellaris.history.v1';
const MAX_HISTORY = 12;

export interface HistoryEntry {
  id: string;
  createdAt: number;
  thumbDataUrl: string;
  inputDataUrl: string;
  options: OverlayOptions;
  result: AnalyzeResponse;
  fileName?: string;
}

export type HistoryListener = (entries: HistoryEntry[]) => void;

const listeners = new Set<HistoryListener>();

/** localStorage doesn't exist in SSR / prerender. Every read/write short-circuits
 * to an empty list so the store module can load safely in Node, and the real
 * history is populated on the client once rehydration runs. */
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

function read(): HistoryEntry[] {
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]): void {
  if (!isBrowser) {
    for (const listener of listeners) listener(entries);
    return;
  }
  let toPersist = entries;
  // Try to write the full set; on quota failure, progressively drop the oldest entries.
  while (toPersist.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
      break;
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
        toPersist = toPersist.slice(0, toPersist.length - 1);
        continue;
      }
      // Some other failure — give up persisting but keep the in-memory listeners updated.
      console.warn('[history] localStorage write failed', err);
      break;
    }
  }
  if (toPersist.length === 0) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  for (const listener of listeners) listener(entries);
}

export const history = {
  list(): HistoryEntry[] {
    return read();
  },
  push(entry: HistoryEntry): HistoryEntry[] {
    const next = [entry, ...read().filter((e) => e.id !== entry.id)].slice(0, MAX_HISTORY);
    write(next);
    return next;
  },
  remove(id: string): HistoryEntry[] {
    const next = read().filter((e) => e.id !== id);
    write(next);
    return next;
  },
  clear(): void {
    write([]);
  },
  subscribe(listener: HistoryListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export async function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function makeThumbnail(source: string, maxSize = 160): Promise<string> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = source;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('thumbnail load failed'));
  });
  const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.78);
}
