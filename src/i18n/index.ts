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
  const syncDocument = (code: string) => {
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

  syncDocument(i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_UI_LANGUAGE);
  i18n.on('languageChanged', syncDocument);
  window.addEventListener('popstate', syncFromLocation);
}

export { UI_LANGUAGES, findUiLanguage };
export default i18n;
