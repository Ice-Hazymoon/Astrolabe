import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES, findUiLanguage } from './languages';
import { baseInitOptions } from './resources';
import { syncLocalizedUrl } from './browserUrl';

/** Client-side i18n singleton. Uses the browser language detector so the app
 * honours `?lang=`, then localStorage, then the browser's `Accept-Language`.
 * On the server, `createServerI18n(lang)` (see ./server.ts) is used instead. */
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    ...baseInitOptions,
    detection: {
      // `?lang=xx` wins so crawlers following hreflang alternates always land
      // on the advertised language; `/lang/<code>/` is the canonical URL shape
      // for non-default locales; localStorage then honours returning users;
      // `navigator` covers first-time visitors; `htmlTag` picks up the language
      // emitted by the prerender step (so an SSR'd page hydrates consistently).
      order: ['querystring', 'path', 'localStorage', 'htmlTag', 'navigator'],
      lookupQuerystring: 'lang',
      lookupFromPathIndex: 1,
      lookupLocalStorage: 'stellaris:lang',
      caches: ['localStorage'],
    },
  });

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
  };

  syncDocument(i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_UI_LANGUAGE);
  i18n.on('languageChanged', syncDocument);
}

export { UI_LANGUAGES, findUiLanguage };
export default i18n;
