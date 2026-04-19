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
  text: string;
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
}

export interface OverlayStarMarker {
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
  constellation_lines: OverlayLineSegment[];
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
  name: string;
  magnitude: number;
  /** Optional — only present when constellation can be derived (mock data, mostly). */
  constellation?: string;
}

export interface VisibleConstellation {
  id: string;
  /** Localized display name (e.g. "大熊座") with English in parens for non-Latin scripts. */
  name: string;
  /** IAU 3-letter abbreviation when known. */
  abbr?: string;
  /** Number of plotted line segments — a rough proxy for star count. */
  starCount: number;
}

export interface DeepSkyObject {
  id: string;
  name: string;
  /** Human-readable type, e.g. "星系", "弥漫星云". */
  type: string;
  magnitude: number;
}

/** Positional payload the UI draws from — constructed from the raw API response. */
export interface CatalogStar {
  id: string;
  name: string;
  hip?: number;
  magnitude: number;
  x: number;
  y: number;
}

export interface CatalogConstellationSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CatalogConstellation {
  id: string;
  abbr: string;
  display_name: string;
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
  /** Negotiated locale for labels — may differ from requested when fallback occurred. */
  resolvedLocale?: Locale | string;
}
