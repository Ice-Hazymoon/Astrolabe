import {defineRouting} from 'next-intl/routing';
import {DEFAULT_UI_LANGUAGE, SUPPORTED_CODES} from './languages';

export const routing = defineRouting({
  locales: SUPPORTED_CODES,
  defaultLocale: DEFAULT_UI_LANGUAGE,
  localePrefix: 'as-needed',
  localeCookie: {
    name: 'stellaris.locale',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  },
});

export function getLocalePath(
  locale: string,
  pathname = '/',
): string {
  const normalizedPath = pathname === '/' ? '' : pathname.startsWith('/') ? pathname : `/${pathname}`;

  if (locale === DEFAULT_UI_LANGUAGE) {
    return normalizedPath || '/';
  }

  return `/${locale}${normalizedPath}`;
}
