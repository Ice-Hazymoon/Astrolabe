import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES, findUiLanguage } from './languages';
import { localizedUrl } from './url';
import { SITE_URL, resolveOrigin } from '@/lib/config';

/** Site origin used in canonical + OG URLs. Prefers the live browser origin so
 * that preview / staging deploys advertise their own URL; falls back to the
 * build-time `VITE_SITE_URL` (the configured production canonical). */
function siteOrigin(): string {
  return resolveOrigin() || SITE_URL;
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, attrs: Record<string, string>): HTMLLinkElement {
  const selectorParts = [`link[rel="${rel}"]`];
  if (attrs.hreflang) selectorParts.push(`[hreflang="${attrs.hreflang}"]`);
  const selector = selectorParts.join('');
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * Keeps `<head>` metadata in sync with the active UI language: updates
 * `<title>`, description / keyword meta, OpenGraph + Twitter cards, canonical
 * link, hreflang alternates, JSON-LD structured data, and the Web App Manifest
 * name. These signals together cover the most impactful SEO knobs:
 *
 * - Title + description drive SERP snippets.
 * - OG / Twitter tags drive rich social previews.
 * - Canonical + hreflang prevent duplicate-content penalties across languages.
 * - Structured data (SoftwareApplication) enables rich Google result cards.
 */
export function useSEO(): void {
  const { t, i18n } = useTranslation('seo');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const origin = siteOrigin();
    const activeLang = findUiLanguage(i18n.resolvedLanguage ?? i18n.language)?.code ?? DEFAULT_UI_LANGUAGE;
    const canonical = localizedUrl(origin, activeLang);
    const title = t('title');
    const description = t('description');
    const keywords = t('keywords');
    const siteName = t('siteName');
    const ogImageAlt = t('ogImageAlt');

    document.title = title;

    upsertMeta('meta[name="description"]', 'name', 'description', description);
    upsertMeta('meta[name="keywords"]', 'name', 'keywords', keywords);
    upsertMeta('meta[name="application-name"]', 'name', 'application-name', siteName);
    upsertMeta('meta[name="apple-mobile-web-app-title"]', 'name', 'apple-mobile-web-app-title', siteName);

    // OpenGraph
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', title);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', siteName);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', origin + '/og-cover.png');
    upsertMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', ogImageAlt);
    upsertMeta('meta[property="og:image:width"]', 'property', 'og:image:width', '1200');
    upsertMeta('meta[property="og:image:height"]', 'property', 'og:image:height', '630');
    upsertMeta('meta[property="og:locale"]', 'property', 'og:locale', bcp47ToOgLocale(i18n.resolvedLanguage ?? i18n.language));

    const otherOgLocales = UI_LANGUAGES
      .map((l) => bcp47ToOgLocale(l.code))
      .filter((c) => c !== bcp47ToOgLocale(i18n.resolvedLanguage ?? i18n.language));
    // Remove prior alternates before re-adding.
    document.head.querySelectorAll('meta[property="og:locale:alternate"]').forEach((n) => n.remove());
    for (const code of otherOgLocales) {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:locale:alternate');
      m.content = code;
      document.head.appendChild(m);
    }

    // Twitter / X card
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', origin + '/og-cover.png');
    upsertMeta('meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', ogImageAlt);

    // Canonical + hreflang alternates (one per supported UI language + x-default)
    upsertLink('canonical', { href: canonical });
    document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((n) => n.remove());
    for (const lang of UI_LANGUAGES) {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = lang.code;
      link.href = localizedUrl(origin, lang.code);
      document.head.appendChild(link);
    }
    const xDefault = document.createElement('link');
    xDefault.rel = 'alternate';
    xDefault.hreflang = 'x-default';
    xDefault.href = origin + '/';
    document.head.appendChild(xDefault);

    // JSON-LD structured data for SoftwareApplication + Organization.
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'SoftwareApplication',
          name: siteName,
          description,
          applicationCategory: 'MultimediaApplication',
          applicationSubCategory: 'Astrophotography',
          operatingSystem: 'Web',
          url: origin + '/',
          image: origin + '/og-cover.png',
          inLanguage: UI_LANGUAGES.map((l) => l.code),
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
          featureList: [
            'Astrometric plate solving',
            'Constellation identification',
            'Named-star identification',
            'Deep-sky object catalog',
            'Multi-language labels',
            'Privacy-friendly: images are not permanently stored',
          ],
        },
        {
          '@type': 'WebSite',
          name: siteName,
          url: origin + '/',
          inLanguage: (i18n.resolvedLanguage ?? i18n.language),
        },
      ],
    };

    let ld = document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]#stellaris-ld');
    if (!ld) {
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.id = 'stellaris-ld';
      document.head.appendChild(ld);
    }
    ld.text = JSON.stringify(jsonLd);

    // Document language + direction are applied elsewhere (in `./index.ts`), but
    // we double-check direction here since RTL locales like Arabic benefit from
    // it being set before first paint.
    const lang = findUiLanguage(i18n.resolvedLanguage ?? i18n.language);
    if (lang) {
      document.documentElement.lang = lang.code;
      document.documentElement.dir = lang.dir;
    }
  }, [t, i18n]);
}

/** Map a BCP-47 code to the closest `og:locale` code. OG expects `ll_CC` form. */
function bcp47ToOgLocale(code: string): string {
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
