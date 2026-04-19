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

  useEffect(() => {
    const current = useSky.getState();
    // If the user has already picked a label locale that differs from the
    // default derived from their browser's UI language, treat that as an
    // explicit override and stop auto-syncing.
    const unsubscribe = useSky.subscribe((state, prev) => {
      if (state.locale !== prev.locale) hasUserOverridden.current = true;
    });

    const apply = (code: string) => {
      if (hasUserOverridden.current) return;
      const lang = findUiLanguage(code);
      if (lang && lang.apiLocale !== current.locale) {
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
