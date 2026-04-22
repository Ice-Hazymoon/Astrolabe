import type { Locale as ApiLocale } from '../types/api';

/**
 * UI language metadata. Each entry is a locale the interface ships translations
 * for. `apiLocale` maps the UI language to the backend label locale that should
 * be used by default when the UI language changes — users can override the
 * label locale independently in settings.
 */
export interface UiLanguage {
  /** BCP-47 code used by Next.js routing and `<html lang="…">`. */
  code: string;
  /** Native self-designation (e.g. "日本語"). */
  nativeLabel: string;
  /** English label (e.g. "Japanese"). */
  englishLabel: string;
  /** Text direction — used for <html dir="…">. */
  dir: 'ltr' | 'rtl';
  /** Backend locale to prefer for celestial labels when this UI language is chosen. */
  apiLocale: ApiLocale;
}

export const UI_LANGUAGES: UiLanguage[] = [
  { code: 'en', nativeLabel: 'English', englishLabel: 'English', dir: 'ltr', apiLocale: 'en' },
  { code: 'zh-Hans', nativeLabel: '简体中文', englishLabel: 'Chinese (Simplified)', dir: 'ltr', apiLocale: 'zh-Hans' },
  { code: 'zh-Hant', nativeLabel: '繁體中文', englishLabel: 'Chinese (Traditional)', dir: 'ltr', apiLocale: 'zh-Hant' },
  { code: 'ja', nativeLabel: '日本語', englishLabel: 'Japanese', dir: 'ltr', apiLocale: 'ja' },
  { code: 'ko', nativeLabel: '한국어', englishLabel: 'Korean', dir: 'ltr', apiLocale: 'ko' },
  { code: 'fr', nativeLabel: 'Français', englishLabel: 'French', dir: 'ltr', apiLocale: 'fr' },
  { code: 'de', nativeLabel: 'Deutsch', englishLabel: 'German', dir: 'ltr', apiLocale: 'de' },
  { code: 'es', nativeLabel: 'Español', englishLabel: 'Spanish', dir: 'ltr', apiLocale: 'es' },
  { code: 'pt', nativeLabel: 'Português', englishLabel: 'Portuguese', dir: 'ltr', apiLocale: 'pt' },
  { code: 'it', nativeLabel: 'Italiano', englishLabel: 'Italian', dir: 'ltr', apiLocale: 'it' },
  { code: 'ru', nativeLabel: 'Русский', englishLabel: 'Russian', dir: 'ltr', apiLocale: 'ru' },
  { code: 'uk', nativeLabel: 'Українська', englishLabel: 'Ukrainian', dir: 'ltr', apiLocale: 'uk' },
  { code: 'nl', nativeLabel: 'Nederlands', englishLabel: 'Dutch', dir: 'ltr', apiLocale: 'nl' },
  { code: 'pl', nativeLabel: 'Polski', englishLabel: 'Polish', dir: 'ltr', apiLocale: 'pl' },
  { code: 'cs', nativeLabel: 'Čeština', englishLabel: 'Czech', dir: 'ltr', apiLocale: 'cs' },
  { code: 'tr', nativeLabel: 'Türkçe', englishLabel: 'Turkish', dir: 'ltr', apiLocale: 'tr' },
  { code: 'id', nativeLabel: 'Bahasa Indonesia', englishLabel: 'Indonesian', dir: 'ltr', apiLocale: 'id' },
  { code: 'th', nativeLabel: 'ไทย', englishLabel: 'Thai', dir: 'ltr', apiLocale: 'th' },
  { code: 'ar', nativeLabel: 'العربية', englishLabel: 'Arabic', dir: 'rtl', apiLocale: 'ar' },
];

/** Locale list shared by routing, metadata, and UI selectors. */
export const SUPPORTED_CODES = UI_LANGUAGES.map((l) => l.code);

export const DEFAULT_UI_LANGUAGE = 'en';
export type UiLanguageCode = (typeof SUPPORTED_CODES)[number];

/** Ordered list of i18n module namespaces. The order also drives fallback lookup. */
export const NAMESPACES = [
  'common',
  'app',
  'upload',
  'preview',
  'processing',
  'result',
  'viewer',
  'error',
  'parameters',
  'history',
  'export',
  'share',
  'catalog',
  'celestial',
  'seo',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export function findUiLanguage(code: string | undefined | null): UiLanguage | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase();
  return UI_LANGUAGES.find((l) => l.code.toLowerCase() === lower);
}

export function isSupportedUiLanguage(code: string | undefined | null): code is UiLanguageCode {
  return !!findUiLanguage(code);
}
