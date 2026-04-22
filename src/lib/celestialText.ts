import type { TFunction } from 'i18next';

/**
 * Look up a celestial-object key in the `celestial` namespace with a fallback.
 * Mirrors what scene.ts bakes into overlay labels so the details sheet stays
 * in lockstep with the canvas on language switch.
 */
export function translateCelestialKey(
  t: TFunction,
  key: string | undefined,
  fallback: string,
): string {
  if (!key) return fallback;
  const hit = t(key, { ns: 'celestial', defaultValue: '' });
  return typeof hit === 'string' && hit.length > 0 ? hit : fallback;
}

function normalizeLookup(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Compose "M42 · 猎户座星云"-style detail labels client-side so the separator
 * and prefix match regardless of the active locale. `base` is the (possibly
 * translated) common name; `messier` / `catalogId` are the prefix candidates.
 */
export function composeCelestialDetailName(
  base: string,
  messier: string | undefined,
  catalogId: string | undefined,
): string {
  if (messier && normalizeLookup(base) !== normalizeLookup(messier)) {
    return `${messier} · ${base}`;
  }
  if (messier) return messier;
  if (
    catalogId &&
    /^(ngc|ic)/i.test(catalogId) &&
    normalizeLookup(base) !== normalizeLookup(catalogId)
  ) {
    return `${catalogId} · ${base}`;
  }
  return base;
}
