import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
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
  const locale = useLocale();
  const setLocale = useSky((s) => s.setLocale);
  const hasUserOverridden = useRef(false);
  const syncingFromUi = useRef(false);
  const activeLanguage = locale;

  useEffect(() => {
    const unsubscribe = useSky.subscribe((state, prev) => {
      if (state.locale === prev.locale) return;
      if (syncingFromUi.current) {
        syncingFromUi.current = false;
        return;
      }

      const activeUi = findUiLanguage(locale);
      hasUserOverridden.current =
        !!activeUi && state.locale !== activeUi.apiLocale;
    });

    return unsubscribe;
  }, [locale]);

  useEffect(() => {
    if (hasUserOverridden.current) return;
    const lang = findUiLanguage(activeLanguage);
    const currentLocale = useSky.getState().locale;
    if (lang && lang.apiLocale !== currentLocale) {
      syncingFromUi.current = true;
      setLocale(lang.apiLocale);
    }
  }, [activeLanguage, setLocale]);
}
