import { NAMESPACES, SUPPORTED_CODES } from './languages';

/**
 * Eagerly bundle every `src/i18n/locales/<lang>/<namespace>.json` at build
 * time. Eager glob import keeps initial i18n lookup synchronous, so the first
 * paint (both SSR and client) never flashes English before the user's
 * preferred language arrives — critical for SEO crawlers and for avoiding a
 * jarring re-render.
 */
type LocaleModule = { default: Record<string, unknown> };

const modules = import.meta.glob<LocaleModule>('./locales/*/*.json', { eager: true });

function buildResources(): Record<string, Record<string, Record<string, unknown>>> {
  const bundles: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const path in modules) {
    const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
    if (!match) continue;
    const [, lang, ns] = match;
    if (!bundles[lang]) bundles[lang] = {};
    bundles[lang][ns] = modules[path].default;
  }
  return bundles;
}

export const resources = buildResources();

/** i18next fallback map — English covers anything missing, and zh variants
 * chain through their written-form siblings before falling back to English. */
export const fallbackLng: Record<string, string[]> = {
  'zh-TW': ['zh-Hant', 'en'],
  'zh-HK': ['zh-Hant', 'en'],
  'zh-MO': ['zh-Hant', 'en'],
  'zh-SG': ['zh-Hans', 'en'],
  'zh-CN': ['zh-Hans', 'en'],
  zh: ['zh-Hans', 'en'],
  default: ['en'],
};

/** Shared options so client and server init stay in sync. */
export const baseInitOptions = {
  resources,
  supportedLngs: SUPPORTED_CODES,
  fallbackLng,
  load: 'currentOnly' as const,
  ns: NAMESPACES as unknown as string[],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
};
