#!/usr/bin/env node
/**
 * Static-site prerender.
 *
 * Pipeline (run by `bun run build`):
 *
 *   1. `vite build` emits the hashed client bundle + `dist/index.html` with
 *      `<!--ssr-outlet-->` in place of the React tree.
 *   2. `vite build --ssr src/entry-server.tsx` emits a Node-consumable copy
 *      of the server entry under `dist-ssr/entry-server.js`.
 *   3. This script loads the server bundle and, for every supported UI
 *      language, renders the app to a string, substitutes language-specific
 *      head fragments into the HTML template, and writes:
 *
 *        dist/index.html             (default language)
 *        dist/lang/<code>/index.html (per-language variants)
 *
 * Each output page has crawler-ready <title>, description, OpenGraph,
 * Twitter, canonical, hreflang alternates, and JSON-LD matching the
 * language in `<html lang="…" dir="…">`.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist');
const ssrDir = resolve(projectRoot, 'dist-ssr');

const templatePath = resolve(distDir, 'index.html');
const serverEntryPath = resolve(ssrDir, 'entry-server.js');

if (!existsSync(templatePath)) {
  console.error(`[prerender] missing ${templatePath} — run \`vite build\` first`);
  process.exit(1);
}
if (!existsSync(serverEntryPath)) {
  console.error(`[prerender] missing ${serverEntryPath} — run \`vite build --ssr\` first`);
  process.exit(1);
}

const template = readFileSync(templatePath, 'utf8');

const serverModule = await import(pathToFileURL(serverEntryPath).href);
const { render, UI_LANGUAGES: LANGS, DEFAULT_UI_LANGUAGE: DEFAULT_LANG = 'en' } = serverModule;

if (!Array.isArray(LANGS) || LANGS.length === 0) {
  console.error('[prerender] server bundle did not export UI_LANGUAGES — aborting');
  process.exit(1);
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderAlternates(alternates, origin) {
  const links = alternates
    .map(
      (a) =>
        `<link rel="alternate" hreflang="${escapeAttr(a.hreflang)}" href="${escapeAttr(a.href)}" />`,
    )
    .join('\n    ');
  const xDefault = `<link rel="alternate" hreflang="x-default" href="${escapeAttr(origin + '/')}" />`;
  return links ? `${links}\n    ${xDefault}` : xDefault;
}

function injectHead(html, head, lang, dir, origin) {
  // 1) <html lang=".." dir="..">
  let out = html.replace(/<html[^>]*>/i, `<html lang="${lang}" dir="${dir}">`);

  // 2) <title>
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(head.title)}</title>`);

  // 3) key meta tags — match by attribute so we don't depend on attribute order.
  const metaUpdates = [
    { selector: /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, content: head.description, attr: 'name="description"' },
    { selector: /<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/i, content: head.keywords, attr: 'name="keywords"' },
    { selector: /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, content: head.title, attr: 'property="og:title"' },
    { selector: /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, content: head.description, attr: 'property="og:description"' },
    { selector: /<meta\s+property="og:locale"\s+content="[^"]*"\s*\/?>/i, content: head.ogLocale, attr: 'property="og:locale"' },
    { selector: /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/?>/i, content: head.ogImageAlt, attr: 'property="og:image:alt"' },
    { selector: /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, content: head.canonical, attr: 'property="og:url"' },
    { selector: /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, content: head.title, attr: 'name="twitter:title"' },
    { selector: /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, content: head.description, attr: 'name="twitter:description"' },
    { selector: /<meta\s+name="twitter:image:alt"\s+content="[^"]*"\s*\/?>/i, content: head.ogImageAlt, attr: 'name="twitter:image:alt"' },
  ];
  for (const upd of metaUpdates) {
    out = out.replace(upd.selector, `<meta ${upd.attr} content="${escapeAttr(upd.content)}" />`);
  }

  // 4) <link rel="canonical">
  out = out.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeAttr(head.canonical)}" />`,
  );

  // 5) Inject hreflang alternates right before </head>.
  out = out.replace('</head>', `    ${renderAlternates(head.alternates, origin)}\n  </head>`);

  // 6) Replace inline JSON-LD with the per-language version.
  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${head.jsonLd}</script>`,
  );

  return out;
}

function localizedPath(code) {
  return code === DEFAULT_LANG ? '/' : `/lang/${code}/`;
}

async function renderLang(lang, origin, alternates, path) {
  const page = render({ lang, url: path, origin, alternates });
  const withHead = injectHead(template, page.head, page.lang, page.dir, origin);
  const withBody = withHead.replace('<!--ssr-outlet-->', page.html);
  return withBody;
}

const origin = (process.env.VITE_SITE_URL || 'https://stellaris.app').replace(/\/+$/, '');
const alternates = LANGS.map((l) => ({ code: l.code }));

// Default root page uses the default UI language so visitors without a `?lang=`
// query string land on the canonical locale.
const defaultHtml = await renderLang(DEFAULT_LANG, origin, alternates, '/');
writeFileSync(templatePath, defaultHtml);
console.log(`[prerender] dist/index.html (${DEFAULT_LANG})`);

// Per-language mirrors under /lang/<code>/index.html for non-default locales —
// these are the targets of the hreflang alternate links. The default language
// lives only at `/` so we do not ship a duplicate `/lang/en/` variant.
for (const lang of LANGS.filter((entry) => entry.code !== DEFAULT_LANG)) {
  const outDir = resolve(distDir, 'lang', lang.code);
  mkdirSync(outDir, { recursive: true });
  const html = await renderLang(lang.code, origin, alternates, localizedPath(lang.code));
  writeFileSync(resolve(outDir, 'index.html'), html);
  console.log(`[prerender] dist/lang/${lang.code}/index.html`);
}

// Tidy: the SSR bundle is only needed during the prerender step.
try {
  rmSync(ssrDir, { recursive: true, force: true });
} catch {
  /* ignore */
}

console.log(`[prerender] done — ${LANGS.length} pages`);
