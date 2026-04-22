/**
 * Runtime configuration.
 *
 * Next.js exposes public browser-safe variables through `NEXT_PUBLIC_*`.
 * During the migration away from Vite we still honor legacy `VITE_*` names so
 * existing local setups do not break mid-refactor.
 */

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const DEFAULT_SITE_URL = 'https://stellaris.app';

function readPublicEnv(nextKey: string, legacyKey?: string): string | undefined {
  return process.env[nextKey] || (legacyKey ? process.env[legacyKey] : undefined);
}

/** Public origin (scheme + host, no trailing slash). */
export const SITE_URL: string = trimTrailingSlash(
  readPublicEnv('NEXT_PUBLIC_SITE_URL', 'VITE_SITE_URL') || DEFAULT_SITE_URL,
);

/** Short brand name — used in `og:site_name` and `application-name`. */
export const SITE_NAME: string =
  readPublicEnv('NEXT_PUBLIC_SITE_NAME', 'VITE_SITE_NAME') || 'Stellaris';

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

export function absoluteUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SITE_URL}${path}`;
}
