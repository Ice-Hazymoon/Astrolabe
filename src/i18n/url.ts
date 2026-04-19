import { DEFAULT_UI_LANGUAGE, findUiLanguage } from './languages';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function localizedPath(code: string | undefined | null): string {
  const resolved = findUiLanguage(code)?.code ?? DEFAULT_UI_LANGUAGE;
  return resolved === DEFAULT_UI_LANGUAGE ? '/' : `/lang/${resolved}/`;
}

export function localizedUrl(origin: string, code: string | undefined | null): string {
  return `${trimTrailingSlash(origin)}${localizedPath(code)}`;
}

export function detectPathLanguage(pathname: string | undefined | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/lang\/([^/]+)\/?$/i);
  const code = match?.[1];
  return findUiLanguage(code)?.code ?? null;
}
