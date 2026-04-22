/**
 * Types mirror the public surface of the Star Annotator API.
 * Only fields actually consumed by the UI are modelled — the backend
 * may return additional metadata that we ignore.
 */

/** RGBA tuple (0–255 on all four channels). */
export type RgbaTuple = [number, number, number, number];

export interface OverlayLineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  line_width: number;
  rgba: RgbaTuple;
}

/** A constellation's stick figure lines, grouped so each figure can be
 * hidden / solo'd independently by the details sheet. `id` is the IAU
 * abbreviation (e.g. "Ori") — stable across locales. */
export interface OverlayConstellationFigure {
  id: string;
  segments: OverlayLineSegment[];
}

export type LabelVariant = 'constellation' | 'star' | 'dso';
export type LabelFontFamily = 'sans' | 'serif' | 'mono';

/** Optional rounded rectangle painted behind a label for readability. */
export interface LabelChip {
  fill_rgba: RgbaTuple;
  border_rgba?: RgbaTuple | null;
  border_width?: number;
  padding_x: number;
  padding_y: number;
  radius: number;
}

export interface OverlayTextItem {
  /** Pre-composed label text in the language the backend resolved, or English
   * when we built it ourselves. Used as the final fallback if i18n lookup misses. */
  text: string;
  /** Stable i18n key (stardroid resource key) for client-side translation via
   * the `celestial` namespace. Renderers call `t('celestial:${key}')` and fall
   * back to `text` / the messier/catalog prefix if the key is missing. */
  i18n_key?: string;
  /** For DSO labels: Messier prefix (e.g. "M42") when present. Used to re-compose
   * "M42 <translated>" client-side in detailed mode. */
  messier?: string;
  /** For DSO labels: NGC/IC identifier when present. */
  catalog_id?: string;
  /** For DSO labels: whether the composed form should prefix with messier/catalog. */
  detailed?: boolean;
  /** Stable object id mirrored from the result payload for exact hide/solo matching. */
  entity_id?: string;
  /** Related constellation abbreviations (IAU) for smart constellation-driven filtering. */
  constellation_ids?: string[];
  /** SVG baseline-start x (textAnchor="start"). */
  x: number;
  /** SVG text baseline y. */
  y: number;
  font_size: number;
  stroke_width: number;
  text_rgba: RgbaTuple;
  stroke_rgba: RgbaTuple;
  leader?: OverlayLineSegment | null;

  /** Logical label class — drives styling defaults in the renderer. */
  variant?: LabelVariant;
  font_weight?: number;
  font_family?: LabelFontFamily;
  italic?: boolean;
  /** Em-based letter spacing (e.g. 0.08). */
  letter_spacing?: number;
  /** Measured width in px — used for chip / bbox rendering. Renderer estimates if absent. */
  text_width?: number;
  /** Optional subtle chip drawn behind the text (DSO labels use this). */
  chip?: LabelChip | null;
  /** For constellation labels only: the IAU abbreviation of the parent
   * constellation (e.g. "Ori"). Enables precise filtering by the details
   * sheet without joining via the localized `text`. */
  constellation?: string;
}

export interface OverlayStarMarker {
  id?: string;
  /** Related constellation abbreviations (IAU) for smart constellation-driven filtering. */
  constellation_ids?: string[];
  x: number;
  y: number;
  radius: number;
  fill_rgba: RgbaTuple;
  outline_rgba: RgbaTuple;
}

export type DeepSkyMarkerShape =
  | 'square'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'ring'
  | 'x_circle';

export interface OverlayDeepSkyMarker {
  id?: string;
  marker: DeepSkyMarkerShape | string;
  x: number;
  y: number;
  radius: number;
  line_width: number;
  rgba: RgbaTuple;
}

export interface OverlayScene {
  image_width: number;
  image_height: number;
  /** Stick figures grouped per constellation so hide/solo can be per-figure. */
  constellation_figures: OverlayConstellationFigure[];
  constellation_labels: OverlayTextItem[];
  star_markers: OverlayStarMarker[];
  star_labels: OverlayTextItem[];
  deep_sky_markers: OverlayDeepSkyMarker[];
  deep_sky_labels: OverlayTextItem[];
}
export type Preset = 'balanced' | 'detailed' | 'max';
export type Locale =
  | 'ar' | 'cs' | 'cy' | 'da' | 'de' | 'el' | 'en' | 'en-GB' | 'es' | 'fa'
  | 'fr' | 'hi' | 'id' | 'it' | 'ja' | 'ko' | 'ms' | 'nb' | 'nl' | 'pl'
  | 'pt' | 'ru' | 'sk' | 'sl' | 'sv' | 'th' | 'tr' | 'uk' | 'zh-Hans' | 'zh-Hant';

export interface OverlayLayers {
  constellation_lines: boolean;
  constellation_labels: boolean;
  contextual_constellation_labels: boolean;
  star_markers: boolean;
  star_labels: boolean;
  deep_sky_markers: boolean;
  deep_sky_labels: boolean;
  label_leaders: boolean;
}

export interface OverlayDetail {
  star_label_limit: number;
  star_magnitude_limit: number;
  dso_label_limit: number;
  dso_magnitude_limit: number;
  show_all_constellation_labels: boolean;
  detailed_dso_labels: boolean;
}

export interface OverlayOptions {
  preset: Preset;
  layers: OverlayLayers;
  detail: OverlayDetail;
}

export interface SolveResult {
  center_ra_deg: number;
  center_dec_deg: number;
  field_width_deg: number;
  field_height_deg: number;
}

export interface NamedStar {
  id: string;
  /** English proper name — used as the fallback when the active locale has
   * no `celestial` translation for this star. */
  name: string;
  /** i18n key for the `celestial` namespace (e.g. "betelgeuse"). */
  i18n_key?: string;
  magnitude: number;
  /** Optional — only present when constellation can be derived (mock data, mostly). */
  constellation?: string;
}

export interface VisibleConstellation {
  id: string;
  /** Pre-composed display name using whatever locale the backend resolved at
   * analyze time. Kept as the final fallback — the details sheet prefers
   * `i18n_key`-based lookup so a client-side language switch updates instantly. */
  name: string;
  /** IAU 3-letter abbreviation when known. */
  abbr?: string;
  /** i18n key for the `celestial` namespace (e.g. "orion"). */
  i18n_key?: string;
  /** English name kept separately so the details sheet can show it as a
   * secondary line under the translated name, matching the canvas overlay. */
  english_name?: string;
  /** Number of plotted line segments — a rough proxy for star count. */
  starCount: number;
}

export interface DeepSkyObject {
  id: string;
  /** Pre-composed "M42 · Orion Nebula" style label in the backend-resolved
   * locale. Used as the fallback when the details sheet can't translate. */
  name: string;
  /** i18n key for the `celestial` namespace (e.g. "orion_nebula", "m42"). */
  i18n_key?: string;
  /** Messier prefix ("M42") carried through for client-side composition. */
  messier?: string;
  /** NGC/IC catalog id carried through for client-side composition. */
  catalog_id?: string;
  /** English common name — fallback for the translated base when the locale
   * has no translation. */
  english_name?: string;
  /** Human-readable type, e.g. "星系", "弥漫星云". */
  type: string;
  magnitude: number;
}

/** Positional payload the UI draws from — constructed from the raw API response. */
export interface CatalogStar {
  id: string;
  /** Always the English proper name from Stellarium's common_star_names catalog. */
  name: string;
  /** i18n key (slugified English name, e.g. "betelgeuse") for `celestial` namespace lookup. */
  i18n_key?: string;
  hip?: number;
  /** Constellation abbreviations derived from stick-figure segment membership. */
  constellation_ids?: string[];
  magnitude: number;
  x: number;
  y: number;
}

export interface CatalogConstellationSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  start_hip?: number;
  end_hip?: number;
}

export interface CatalogConstellation {
  id: string;
  abbr: string;
  display_name: string;
  /** i18n key (e.g. "orion", "ursa_major") for `celestial` namespace lookup. */
  i18n_key?: string;
  native_name?: string;
  english_name?: string;
  label_x: number;
  label_y: number;
  show_label: boolean;
  segments: CatalogConstellationSegment[];
}

export interface CatalogDso {
  id: string;
  name: string;
  /** i18n key (e.g. "m42", "andromeda_galaxy") for `celestial` namespace lookup. */
  i18n_key?: string;
  /** NGC/IC identifier when known (used for detailed-label prefix composition). */
  catalog_id?: string;
  /** Raw backend type code (e.g. "OCl", "PN", "Cl+N"). */
  type_code: string;
  /** Localized, human-readable DSO type. */
  type_label: string;
  magnitude: number;
  x: number;
  y: number;
  /** Shortest recognizable label (e.g. "M45"). */
  primary_label: string;
  /** Detailed label (e.g. "M45 昴宿星团"). */
  detailed_label: string;
  messier?: string;
  common_name?: string;
  curated?: boolean;
}

export interface Catalog {
  image_width: number;
  image_height: number;
  stars: CatalogStar[];
  constellations: CatalogConstellation[];
  dsos: CatalogDso[];
}

export interface AnalyzeResponse {
  processingMs: number;
  inputImageUrl: string | null;
  solve: SolveResult;
  /** Full positional payload the frontend renders from. */
  catalog: Catalog;
  visible_named_stars: NamedStar[];
  visible_constellations: VisibleConstellation[];
  visible_deep_sky_objects: DeepSkyObject[];
}
