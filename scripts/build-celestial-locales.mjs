#!/usr/bin/env node
/**
 * Import celestial-object translations from the star backend's stardroid
 * bundles into this app's i18n tree.
 *
 * Source: ../star/data/reference/stardroid-locales/values-*\/celestial_objects.xml
 * Output: src/i18n/locales/<lang>/celestial.json
 *
 * Only emits for UI languages this app supports. Writes sparse files (a locale
 * only contains keys it actually has translations for); i18next fallbackLng
 * handles the rest. check-i18n.mjs skips strict parity on celestial.json for
 * that reason.
 *
 * Usage: node scripts/build-celestial-locales.mjs [--star <path>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_OUT = path.join(REPO_ROOT, 'src/i18n/locales');

function parseArgs(argv) {
  const args = { starRepo: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--star' && argv[i + 1]) {
      args.starRepo = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function resolveStarRepo(arg) {
  const candidates = [
    arg,
    path.resolve(REPO_ROOT, '../star'),
    path.resolve(REPO_ROOT, '../Star'),
    process.env.STAR_REPO,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const stardroid = path.join(candidate, 'data/reference/stardroid-locales');
    if (fs.existsSync(stardroid)) return candidate;
  }
  throw new Error(
    `Could not find stardroid locales. Pass --star <path> or set STAR_REPO. Tried: ${candidates.join(', ')}`,
  );
}

/** Mirror annotate_localization.normalize_constellation_key. */
function normalizeKey(raw) {
  if (!raw) return '';
  const lowered = String(raw).trim().toLowerCase();
  if (!lowered) return '';
  const stripped = lowered.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const slug = stripped.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (slug) return slug;
  return lowered.replace(/\s+/g, '');
}

function decodeXmlEntities(text) {
  return text
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseStardroidXml(xmlText) {
  const out = {};
  const re = /<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g;
  let match;
  while ((match = re.exec(xmlText)) !== null) {
    const key = normalizeKey(match[1]);
    if (!key || key in out) continue;
    const value = decodeXmlEntities(match[2]).trim();
    if (value) out[key] = value;
  }
  return out;
}

/** Map a stardroid values-* directory name to a BCP-47 tag. */
function valuesDirToLocale(name) {
  if (name === 'values') return 'en';
  if (name.startsWith('values-b+')) {
    // e.g. values-b+zh+Hans → zh-Hans, values-b+en+GB → en-GB
    return name.slice('values-b+'.length).replaceAll('+', '-');
  }
  if (name.startsWith('values-')) return name.slice('values-'.length);
  return null;
}

/** UI languages this app actually ships — keep in sync with languages.ts. */
const UI_LANGUAGES = [
  'en',
  'zh-Hans',
  'zh-Hant',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'pt',
  'it',
  'ru',
  'uk',
  'nl',
  'pl',
  'cs',
  'tr',
  'id',
  'th',
  'ar',
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  const starRepo = resolveStarRepo(args.starRepo);
  const stardroidDir = path.join(starRepo, 'data/reference/stardroid-locales');

  const byLocale = new Map();
  for (const entry of fs.readdirSync(stardroidDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const xmlPath = path.join(stardroidDir, entry.name, 'celestial_objects.xml');
    if (!fs.existsSync(xmlPath)) continue;
    const locale = valuesDirToLocale(entry.name);
    if (!locale) continue;
    if (byLocale.has(locale)) continue;
    const strings = parseStardroidXml(fs.readFileSync(xmlPath, 'utf8'));
    byLocale.set(locale, strings);
  }

  let totalBytes = 0;
  for (const lang of UI_LANGUAGES) {
    const strings = byLocale.get(lang) ?? {};
    const langDir = path.join(LOCALES_OUT, lang);
    fs.mkdirSync(langDir, { recursive: true });
    const sorted = Object.fromEntries(
      Object.entries(strings).sort(([a], [b]) => a.localeCompare(b)),
    );
    const outPath = path.join(langDir, 'celestial.json');
    const payload = `${JSON.stringify(sorted, null, 2)}\n`;
    fs.writeFileSync(outPath, payload);
    totalBytes += Buffer.byteLength(payload, 'utf8');
    const count = Object.keys(sorted).length;
    const relOut = path.relative(REPO_ROOT, outPath);
    console.log(`${lang.padEnd(8)}  ${String(count).padStart(4)} keys  →  ${relOut}`);
  }

  console.log(`\nTotal bundle size: ${(totalBytes / 1024).toFixed(1)} KB across ${UI_LANGUAGES.length} locales.`);
}

main();
