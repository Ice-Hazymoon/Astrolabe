/**
 * Runtime configuration. Values come from Vite env variables (`VITE_*`, which
 * are substituted at build time) with safe defaults for dev/test.
 *
 * Anything that touches a publicly-visible URL — meta tags, OG, hreflang,
 * sitemap, JSON-LD, social share intents — MUST read from here so we never
 * ship a stale hard-coded domain to production.
 */

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const DEFAULT_SITE_URL = 'https://stellaris.app';

/** Public origin (scheme + host, no trailing slash). */
export const SITE_URL: string = trimTrailingSlash(
  (import.meta.env.VITE_SITE_URL as string | undefined) || DEFAULT_SITE_URL,
);

/** Short brand name — used in `og:site_name` and `application-name`. */
export const SITE_NAME: string =
  (import.meta.env.VITE_SITE_NAME as string | undefined) || 'Stellaris';

/** Bare host (no scheme). Handy for small UI chrome like the share-dialog footer. */
export const SITE_HOST: string = (() => {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return SITE_URL.replace(/^https?:\/\//, '');
  }
})();

/**
 * Resolve the active origin for the current request. On the browser we prefer
 * `window.location.origin` so local dev shows `http://localhost:5173` in share
 * URLs instead of the production domain. On the server (SSR / prerender) we
 * always fall back to the configured `SITE_URL`.
 */
export function resolveOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return SITE_URL;
}
