import { createInstance, type i18n as I18nType } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_UI_LANGUAGE } from './languages';
import { baseInitOptions } from './resources';

/**
 * Build a fresh i18next instance bound to a specific language — used by the
 * SSR / prerender entry so each rendered page gets a clean instance that
 * doesn't leak state across requests. Synchronous (all resources are bundled
 * eagerly), so the caller can render immediately without awaiting.
 */
export function createServerI18n(lang: string = DEFAULT_UI_LANGUAGE): I18nType {
  const instance = createInstance();
  // `initImmediate: false` forces synchronous init when resources are bundled,
  // which is what we want for SSR — the renderer must be able to call `t()`
  // right after `createInstance()` without awaiting. We cast through unknown to
  // reach it because the typings don't surface the option, but the runtime
  // honours it.
  void instance.use(initReactI18next).init({
    ...baseInitOptions,
    lng: lang,
    initImmediate: false,
  } as unknown as Parameters<typeof instance.init>[0]);
  return instance;
}
