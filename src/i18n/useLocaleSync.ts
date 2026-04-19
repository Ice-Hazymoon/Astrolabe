import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSky } from '@/state/store';
import { findUiLanguage } from './languages';

/**
 * Keeps the backend label locale aligned with the UI language on first mount
 * and whenever the user changes the UI language — unless they've manually
 * overridden the label locale in settings, in which case we leave their pick
 * alone. Celestial labels come from Stardroid tables that may not carry every
 * UI-supported locale; the store's `setLocale` already accepts any string, and
 * the API falls back to English on unknown locales.
 */
export function useLocaleSync(): void {
  const { i18n } = useTranslation();
  const setLocale = useSky((s) => s.setLocale);
  const hasUserOverridden = useRef(false);
  const syncingFromUi = useRef(false);

  useEffect(() => {
    const unsubscribe = useSky.subscribe((state, prev) => {
      if (state.locale === prev.locale) return;
      if (syncingFromUi.current) {
        syncingFromUi.current = false;
        return;
      }

      const activeUi = findUiLanguage(i18n.resolvedLanguage ?? i18n.language);
      hasUserOverridden.current =
        !!activeUi && state.locale !== activeUi.apiLocale;
    });

    const apply = (code: string) => {
      if (hasUserOverridden.current) return;
      const lang = findUiLanguage(code);
      const currentLocale = useSky.getState().locale;
      if (lang && lang.apiLocale !== currentLocale) {
        syncingFromUi.current = true;
        setLocale(lang.apiLocale);
      }
    };

    apply(i18n.resolvedLanguage ?? i18n.language);
    const handler = (lng: string) => apply(lng);
    i18n.on('languageChanged', handler);
    return () => {
      i18n.off('languageChanged', handler);
      unsubscribe();
    };
  }, [i18n, setLocale]);
}
