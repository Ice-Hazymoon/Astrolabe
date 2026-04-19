/* eslint-disable react-refresh/only-export-components */
// Server-only entry: Fast Refresh's "only export components" rule doesn't apply
// because this module never runs in the dev HMR tree — it's bundled through
// Vite SSR and executed by the prerender script.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import { createServerI18n } from './i18n/server';
import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES, findUiLanguage } from './i18n/languages';
import { SITE_URL } from './lib/config';

// Re-export so the prerender script can iterate without a second import entry.
export { UI_LANGUAGES, DEFAULT_UI_LANGUAGE };

export interface RenderedPage {
  /** HTML body (goes into `<div id="root">`). */
  html: string;
  /** Language code actually rendered (post-fallback). */
  lang: string;
  /** Text direction for `<html dir="…">`. */
  dir: 'ltr' | 'rtl';
  /** Pre-resolved `<head>` additions to stitch into the template. */
  head: {
    title: string;
    description: string;
    keywords: string;
    ogImageAlt: string;
    canonical: string;
    ogLocale: string;
    jsonLd: string;
    alternates: Array<{ hreflang: string; href: string }>;
  };
}

interface RenderOptions {
  /** Target language code, e.g. `'zh-Hans'`. Falls back to the default UI language. */
  lang?: string;
  /** Request path (used for canonical URL). */
  url?: string;
  /** Override the origin used in canonical/hreflang URLs. Defaults to `SITE_URL`. */
  origin?: string;
  /** Languages advertised in the `<link rel="alternate" hreflang>` block. */
  alternates?: Array<{ code: string }>;
}

/** BCP-47 → OG `ll_CC` locale code. Keep in sync with useSEO.ts. */
const OG_LOCALE_MAP: Record<string, string> = {
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

function ogLocale(code: string): string {
  return OG_LOCALE_MAP[code.toLowerCase()] ?? code.replace('-', '_');
}

/**
 * Render the app for a given language. Produces the inner HTML for `#root`
 * plus the language-specific head fragments that the prerender script stitches
 * into `dist/index.html` and per-language variants.
 */
export function render(options: RenderOptions = {}): RenderedPage {
  const requested = options.lang ?? DEFAULT_UI_LANGUAGE;
  const langEntry = findUiLanguage(requested);
  const lang = langEntry?.code ?? DEFAULT_UI_LANGUAGE;
  const dir = langEntry?.dir ?? 'ltr';

  const i18n = createServerI18n(lang);
  const html = renderToString(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </StrictMode>,
  );

  const origin = (options.origin ?? SITE_URL).replace(/\/+$/, '');
  const path = options.url ?? '/';
  const canonical = origin + path;
  const alternates = (options.alternates ?? []).map(({ code }) => ({
    hreflang: code,
    href: `${origin}/?lang=${code}`,
  }));

  const seoT = (key: string): string => i18n.t(key, { ns: 'seo' });

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: seoT('siteName'),
        description: seoT('description'),
        applicationCategory: 'MultimediaApplication',
        applicationSubCategory: 'Astrophotography',
        operatingSystem: 'Web',
        url: origin + '/',
        image: origin + '/og-cover.png',
        inLanguage: (options.alternates ?? []).map((a) => a.code),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
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
        name: seoT('siteName'),
        url: origin + '/',
        inLanguage: lang,
      },
    ],
  });

  return {
    html,
    lang,
    dir,
    head: {
      title: seoT('title'),
      description: seoT('description'),
      keywords: seoT('keywords'),
      ogImageAlt: seoT('ogImageAlt'),
      canonical,
      ogLocale: ogLocale(lang),
      jsonLd,
      alternates,
    },
  };
}
