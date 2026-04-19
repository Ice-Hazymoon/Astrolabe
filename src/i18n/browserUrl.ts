import { localizedPath } from './url';

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
