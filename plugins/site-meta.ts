import type { Plugin } from 'vite';
import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES } from '../src/i18n/languages';
import { localizedPath, localizedUrl } from '../src/i18n/url';

interface SiteMetaOptions {
  siteUrl: string;
  siteName: string;
}

/**
 * Build-time plugin that:
 *
 * 1. Substitutes `%SITE_URL%`, `%SITE_NAME%`, and `%SITE_HOST%` placeholders
 *    throughout `index.html` so the static meta tags always reflect the
 *    deployed origin — no hard-coded domains slip into production.
 *
 * 2. Emits `sitemap.xml` and `robots.txt` as build assets, with one
 *    hreflang alternate per supported UI language (+ `x-default`). Writing
 *    these from code keeps them in lock-step with `UI_LANGUAGES` — adding
 *    a new language automatically adds it to the sitemap.
 */
export function siteMetaPlugin({ siteUrl, siteName }: SiteMetaOptions): Plugin {
  const origin = siteUrl.replace(/\/+$/, '');
  const host = origin.replace(/^https?:\/\//, '');

  return {
    name: 'stellaris-site-meta',
    apply: 'build',
    enforce: 'pre',

    transformIndexHtml(html) {
      return html
        .replace(/%SITE_URL%/g, origin)
        .replace(/%SITE_NAME%/g, siteName)
        .replace(/%SITE_HOST%/g, host);
    },

    generateBundle() {
      const alternates = () =>
        [
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}/" />`,
          ...UI_LANGUAGES.map(
            (lang) =>
              `    <xhtml:link rel="alternate" hreflang="${lang.code}" href="${localizedUrl(origin, lang.code)}" />`,
          ),
        ].join('\n');

      const urls = [
        {
          code: DEFAULT_UI_LANGUAGE,
          path: localizedPath(DEFAULT_UI_LANGUAGE),
          priority: '1.0',
        },
        ...UI_LANGUAGES
          .filter((lang) => lang.code !== DEFAULT_UI_LANGUAGE)
          .map((lang) => ({
            code: lang.code,
            path: localizedPath(lang.code),
            priority: '0.9',
          })),
      ];

      const sitemap =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
        urls
          .map(
            ({ path, priority }) =>
              '  <url>\n' +
              `    <loc>${origin}${path}</loc>\n` +
              '    <changefreq>weekly</changefreq>\n' +
              `    <priority>${priority}</priority>\n` +
              `${alternates()}\n` +
              '  </url>\n',
          )
          .join('') +
        '</urlset>\n';

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: sitemap,
      });

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source:
          'User-agent: *\n' +
          'Allow: /\n' +
          'Disallow: /api/\n' +
          '\n' +
          `Sitemap: ${origin}/sitemap.xml\n`,
      });
    },
  };
}
