import type {
  AnalyzeResponse,
  Catalog,
  CatalogConstellation,
  CatalogConstellationSegment,
  CatalogDso,
  CatalogStar,
  DeepSkyObject,
  Locale,
  NamedStar,
  OverlayOptions,
  VisibleConstellation,
} from '@/types/api';

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://localhost:3000';

interface RawHealth {
  ok: boolean;
  workerReady?: boolean;
}

interface RawSegmentEnd {
  x: number;
  y: number;
  hip?: number;
}

interface RawConstellationSegment {
  start: RawSegmentEnd;
  end: RawSegmentEnd;
}

interface RawAnalyzeResponse {
  processingMs: number;
  image_width?: number;
  image_height?: number;
  inputImageUrl: string | null;
  solve: {
    center_ra_deg: number;
    center_dec_deg: number;
    field_width_deg: number;
    field_height_deg: number;
  };
  visible_named_stars: Array<{
    hip?: number;
    name: string;
    magnitude: number | null;
    x?: number;
    y?: number;
  }>;
  visible_constellations: Array<{
    abbr: string;
    english_name?: string;
    native_name?: string;
    display_name?: string;
    label_x?: number;
    label_y?: number;
    show_label?: boolean;
    segments?: RawConstellationSegment[];
  }>;
  visible_deep_sky_objects: Array<{
    name: string;
    type: string;
    magnitude: number | null;
    x?: number;
    y?: number;
    messier?: string;
    common_name?: string;
    label?: string;
    display_label?: string;
    curated?: boolean;
  }>;
  localization?: {
    requested_locale?: string;
    resolved_locale?: string;
    available_locales?: string[];
  };
  overlay_scene?: { image_width?: number; image_height?: number };
}

/**
 * DSO type labels are resolved client-side through i18n. The raw backend code
 * (e.g. "OCl") is preserved in `type_code`, and `type_label` is filled with the
 * raw code here so renderers can translate it on demand via the `catalog.dsoTypes` namespace.
 */
function dsoTypeLabel(code: string): string {
  return code;
}

/** DSOs without a catalogued magnitude sort as "very faint" so they only surface at high thresholds. */
const UNKNOWN_MAGNITUDE = 99;

function normalizeStar(raw: RawAnalyzeResponse['visible_named_stars'][number]): NamedStar {
  return {
    id: raw.hip != null ? `hip-${raw.hip}` : `star-${raw.name}`,
    name: raw.name,
    magnitude: raw.magnitude ?? UNKNOWN_MAGNITUDE,
  };
}

function normalizeConstellation(
  raw: RawAnalyzeResponse['visible_constellations'][number],
): VisibleConstellation {
  const display = raw.display_name?.trim() || null;
  const native = raw.native_name?.trim() || null;
  const english = raw.english_name?.trim() || null;
  const primary = display ?? native ?? english ?? raw.abbr;
  const secondary = display && (native ?? english) && display !== (native ?? english)
    ? ` · ${native ?? english}`
    : '';
  return {
    id: raw.abbr,
    abbr: raw.abbr,
    name: `${primary}${secondary}`,
    starCount: Array.isArray(raw.segments) ? raw.segments.length : 0,
  };
}

function normalizeDso(raw: RawAnalyzeResponse['visible_deep_sky_objects'][number]): DeepSkyObject {
  const localized = raw.display_label ?? raw.label;
  const english = raw.common_name ?? raw.messier ?? raw.name;
  const showSecondary = localized && localized !== english && localized !== raw.name;
  const primary = localized ?? english ?? raw.name;
  const secondary = showSecondary ? ` · ${english}` : '';
  return {
    id: raw.name,
    name: `${primary}${secondary}`,
    type: dsoTypeLabel(raw.type),
    magnitude: raw.magnitude ?? UNKNOWN_MAGNITUDE,
  };
}

function toCatalogStar(raw: RawAnalyzeResponse['visible_named_stars'][number]): CatalogStar | null {
  if (raw.x == null || raw.y == null) return null;
  return {
    id: raw.hip != null ? `hip-${raw.hip}` : `star-${raw.name}`,
    hip: raw.hip,
    name: raw.name,
    magnitude: raw.magnitude ?? UNKNOWN_MAGNITUDE,
    x: raw.x,
    y: raw.y,
  };
}

function toCatalogConstellation(
  raw: RawAnalyzeResponse['visible_constellations'][number],
): CatalogConstellation | null {
  const segments: CatalogConstellationSegment[] = Array.isArray(raw.segments)
    ? raw.segments
        .filter((s) => s?.start && s?.end)
        .map((s) => ({ x1: s.start.x, y1: s.start.y, x2: s.end.x, y2: s.end.y }))
    : [];
  if (raw.label_x == null || raw.label_y == null) return null;
  return {
    id: raw.abbr,
    abbr: raw.abbr,
    display_name: raw.display_name?.trim() || raw.native_name?.trim() || raw.english_name?.trim() || raw.abbr,
    native_name: raw.native_name?.trim() || undefined,
    english_name: raw.english_name?.trim() || undefined,
    label_x: raw.label_x,
    label_y: raw.label_y,
    show_label: raw.show_label ?? true,
    segments,
  };
}

function toCatalogDso(raw: RawAnalyzeResponse['visible_deep_sky_objects'][number]): CatalogDso | null {
  if (raw.x == null || raw.y == null) return null;
  const messier = raw.messier?.trim() || undefined;
  const common = raw.common_name?.trim() || undefined;
  const detailed = raw.display_label?.trim() || raw.label?.trim() || messier || common || raw.name;
  const primary = messier || common || raw.name;
  return {
    id: raw.name,
    name: raw.name,
    type_code: raw.type,
    type_label: dsoTypeLabel(raw.type),
    magnitude: raw.magnitude ?? UNKNOWN_MAGNITUDE,
    x: raw.x,
    y: raw.y,
    primary_label: primary,
    detailed_label: detailed,
    messier,
    common_name: common,
    curated: raw.curated,
  };
}

function normalize(raw: RawAnalyzeResponse): AnalyzeResponse {
  const width = raw.image_width ?? raw.overlay_scene?.image_width ?? 0;
  const height = raw.image_height ?? raw.overlay_scene?.image_height ?? 0;
  const catalog: Catalog = {
    image_width: width,
    image_height: height,
    stars: raw.visible_named_stars.map(toCatalogStar).filter((s): s is CatalogStar => s != null),
    constellations: raw.visible_constellations
      .map(toCatalogConstellation)
      .filter((c): c is CatalogConstellation => c != null),
    dsos: raw.visible_deep_sky_objects.map(toCatalogDso).filter((d): d is CatalogDso => d != null),
  };

  return {
    processingMs: raw.processingMs,
    inputImageUrl: raw.inputImageUrl,
    solve: raw.solve,
    catalog,
    visible_named_stars: raw.visible_named_stars.map(normalizeStar),
    visible_constellations: raw.visible_constellations.map(normalizeConstellation),
    visible_deep_sky_objects: raw.visible_deep_sky_objects.map(normalizeDso),
    resolvedLocale: raw.localization?.resolved_locale,
  };
}

export async function probeApi(signal?: AbortSignal, timeoutMs = 2500): Promise<boolean> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}/healthz`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as RawHealth;
    return body.ok === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

interface AnalyzeArgs {
  file: Blob;
  locale: Locale;
  signal?: AbortSignal;
}

/**
 * The frontend always renders the overlay itself and always asks the backend for the
 * full catalog (all layers, widest magnitude bands). Layer visibility and detail caps are
 * applied in the browser from `catalog`, so presets/toggles update without another round-trip.
 */
const MAX_DETAIL_REQUEST: OverlayOptions = {
  preset: 'max',
  layers: {
    constellation_lines: true,
    constellation_labels: true,
    contextual_constellation_labels: true,
    star_markers: true,
    star_labels: true,
    deep_sky_markers: true,
    deep_sky_labels: true,
    label_leaders: true,
  },
  detail: {
    star_label_limit: 96,
    star_magnitude_limit: 7,
    dso_label_limit: 96,
    dso_magnitude_limit: 13,
    show_all_constellation_labels: true,
    detailed_dso_labels: true,
  },
};

export async function analyzeViaApi({ file, locale, signal }: AnalyzeArgs): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append('image', file, 'upload');
  form.append('render_mode', 'client');
  form.append('locale', locale);
  form.append('options', JSON.stringify(MAX_DETAIL_REQUEST));

  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    body: form,
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  const raw = (await response.json()) as RawAnalyzeResponse;
  return normalize(raw);
}
