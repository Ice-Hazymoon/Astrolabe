import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES, findUiLanguage } from './languages';
import { baseInitOptions } from './resources';
import { detectInitialUiLanguage, detectUrlUiLanguage, syncLocalizedUrl } from './browserUrl';
import { saveLanguage } from './autoRedirect';

/**
 * Client-side i18n singleton. Bootstrap from the current URL / prerendered
 * `<html lang>` synchronously so hydration sees the same language the server
 * rendered. Route changes then keep the i18n state and pathname aligned.
 */
const initialLanguage =
  typeof document === 'undefined'
    ? DEFAULT_UI_LANGUAGE
    : detectInitialUiLanguage({
        pathname: window.location.pathname,
        search: window.location.search,
        htmlLang: document.documentElement.lang,
      });

void i18n
  .use(initReactI18next)
  .init(
    {
      ...baseInitOptions,
      lng: initialLanguage,
      initImmediate: false,
    } as unknown as Parameters<typeof i18n.init>[0],
  );

function applyDocumentLang(code: string): void {
  if (typeof document === 'undefined') return;
  const lang = findUiLanguage(code) ?? findUiLanguage(DEFAULT_UI_LANGUAGE);
  if (!lang) return;
  document.documentElement.lang = lang.code;
  document.documentElement.dir = lang.dir;
}

if (typeof document !== 'undefined') {
  // On the initial boot we deliberately do NOT persist the language — this
  // module is imported (and runs) before `maybeAutoRedirect` gets a chance to
  // read localStorage. If we wrote the bootstrap default here, auto-redirect
  // would always see saved='en' and never honor the user's browser locale.
  // Persistence happens only via `languageChanged` below (switcher / reload
  // after redirect) and via `maybeAutoRedirect` when the URL is explicit.
  const onLanguageChanged = (code: string) => {
    applyDocumentLang(code);
    syncLocalizedUrl(code);
    saveLanguage(code);
  };

  const syncFromLocation = () => {
    const code = detectUrlUiLanguage(window.location.pathname, window.location.search);
    const active = findUiLanguage(i18n.resolvedLanguage ?? i18n.language)?.code ?? DEFAULT_UI_LANGUAGE;
    if (code !== active) {
      void i18n.changeLanguage(code);
    }
  };

  const initial = i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_UI_LANGUAGE;
  applyDocumentLang(initial);
  syncLocalizedUrl(initial);
  i18n.on('languageChanged', onLanguageChanged);
  window.addEventListener('popstate', syncFromLocation);
}

export { UI_LANGUAGES, findUiLanguage };
export default i18n;
