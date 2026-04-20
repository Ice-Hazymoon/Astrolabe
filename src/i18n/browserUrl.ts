import { DEFAULT_UI_LANGUAGE, findUiLanguage } from './languages';
import { detectPathLanguage, localizedPath } from './url';

function normalizeUiLanguage(code: string | undefined | null): string | null {
  return findUiLanguage(code)?.code ?? null;
}

export function detectQueryLanguage(search: string | undefined | null): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return normalizeUiLanguage(params.get('lang'));
}

export function detectInitialUiLanguage(options?: {
  pathname?: string | null;
  search?: string | null;
  htmlLang?: string | null;
}): string {
  return (
    detectQueryLanguage(options?.search) ??
    detectPathLanguage(options?.pathname) ??
    normalizeUiLanguage(options?.htmlLang) ??
    DEFAULT_UI_LANGUAGE
  );
}

export function detectUrlUiLanguage(
  pathname: string | undefined | null,
  search: string | undefined | null,
): string {
  return detectQueryLanguage(search) ?? detectPathLanguage(pathname) ?? DEFAULT_UI_LANGUAGE;
}

export function syncLocalizedUrl(code: string | undefined | null): void {
  if (typeof window === 'undefined') return;

  const nextPath = localizedPath(code);
  const url = new URL(window.location.href);
  url.pathname = nextPath;
  url.searchParams.delete('lang');

  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;

  window.history.replaceState(window.history.state, '', next);
}
