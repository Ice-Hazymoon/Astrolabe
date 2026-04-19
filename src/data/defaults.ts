import type { Locale, OverlayOptions, Preset } from '@/types/api';

export const DEFAULT_OPTIONS: OverlayOptions = {
  preset: 'balanced',
  layers: {
    constellation_lines: true,
    constellation_labels: true,
    contextual_constellation_labels: false,
    star_markers: true,
    star_labels: true,
    deep_sky_markers: true,
    deep_sky_labels: true,
    label_leaders: true,
  },
  detail: {
    star_label_limit: 32,
    star_magnitude_limit: 5.5,
    dso_label_limit: 24,
    dso_magnitude_limit: 9,
    show_all_constellation_labels: false,
    detailed_dso_labels: true,
  },
};

export const PRESETS: Record<Preset, OverlayOptions> = {
  balanced: DEFAULT_OPTIONS,
  detailed: {
    preset: 'detailed',
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
      star_label_limit: 48,
      star_magnitude_limit: 6,
      dso_label_limit: 40,
      dso_magnitude_limit: 10,
      show_all_constellation_labels: false,
      detailed_dso_labels: true,
    },
  },
  max: {
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
      star_label_limit: 64,
      star_magnitude_limit: 6.5,
      dso_label_limit: 64,
      dso_magnitude_limit: 11,
      show_all_constellation_labels: true,
      detailed_dso_labels: true,
    },
  },
};

/** Celestial-label locales exposed in the parameter panel. These are the API-side
 * languages the Stardroid tables carry the richest label coverage for. */
export const LABEL_LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'it', label: 'Italiano' },
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'cs', label: 'Čeština' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'th', label: 'ไทย' },
  { value: 'ar', label: 'العربية' },
];

export const DEFAULT_LOCALE: Locale = 'en';
