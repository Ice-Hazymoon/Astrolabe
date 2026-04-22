import 'server-only';

import { cache } from 'react';
import { loadLocaleNamespaces } from '@/i18n/dictionaries';
import {
  DEFAULT_UI_LANGUAGE,
  findUiLanguage,
  isSupportedUiLanguage,
  type UiLanguageCode,
} from '@/i18n/languages';
import { getLocalePath } from '@/i18n/routing';
import { absoluteUrl, SITE_NAME, SITE_URL } from '@/lib/config';

function resolveLocale(locale: string): UiLanguageCode {
  return isSupportedUiLanguage(locale) ? locale : DEFAULT_UI_LANGUAGE;
}

function ogLocale(code: string): string {
  const normalized = code.toLowerCase();
  const table: Record<string, string> = {
    en: 'en_US',
    'zh-hans': 'zh_CN',
    'zh-hant': 'zh_TW',
    ja: 'ja_JP',
    ko: 'ko_KR',
    fr: 'fr_FR',
    de: 'de_DE',
    es: 'es_ES',
    pt: 'pt_PT',
    it: 'it_IT',
    ru: 'ru_RU',
    uk: 'uk_UA',
    nl: 'nl_NL',
    pl: 'pl_PL',
    cs: 'cs_CZ',
    tr: 'tr_TR',
    id: 'id_ID',
    th: 'th_TH',
    ar: 'ar_AR',
  };
  return table[normalized] ?? normalized.replace('-', '_');
}

export const getLocaleSeo = cache(async (locale: string) => {
  const resolvedLocale = resolveLocale(locale);
  const payload = await loadLocaleNamespaces(resolvedLocale, ['seo']);
  const messages = payload.messages;
  const seo = messages.seo as Record<string, string> | undefined;

  return {
    title: seo?.title ?? `${SITE_NAME} — Star Annotator`,
    shortTitle: seo?.shortTitle ?? `${SITE_NAME} · Star Annotator`,
    description:
      seo?.description ??
      'Upload a photo of the night sky and identify constellations, named stars, and deep-sky objects.',
    keywords: seo?.keywords ?? 'star annotator, plate solving, night sky',
    ogImageAlt: seo?.ogImageAlt ?? 'Annotated night-sky photograph',
    siteName: seo?.siteName ?? SITE_NAME,
    ogLocale: ogLocale(resolvedLocale),
  };
});

export const getJsonLd = cache(async (locale: string) => {
  const seo = await getLocaleSeo(locale);
  const language = findUiLanguage(locale)?.code ?? DEFAULT_UI_LANGUAGE;
  const localePath = getLocalePath(language);
  const ogImagePath = '/og-cover.png';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: seo.siteName,
        description: seo.description,
        applicationCategory: 'MultimediaApplication',
        applicationSubCategory: 'Astrophotography',
        operatingSystem: 'Web',
        url: absoluteUrl(localePath),
        image: absoluteUrl(ogImagePath),
        inLanguage: language,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'WebSite',
        name: seo.siteName,
        url: SITE_URL,
        inLanguage: language,
      },
    ],
  };
});
