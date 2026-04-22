import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES, findUiLanguage } from './languages';
import { detectPathLanguage, localizedPath } from './url';
import { detectQueryLanguage } from './browserUrl';

const STORAGE_KEY = 'stellaris.uiLang';
const SESSION_FLAG = 'stellaris.autoRedirected';

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function readSavedLanguage(): string | null {
  const store = safeLocalStorage();
  if (!store) return null;
  try {
    return findUiLanguage(store.getItem(STORAGE_KEY))?.code ?? null;
  } catch {
    return null;
  }
}

export function saveLanguage(code: string | undefined | null): void {
  const resolved = findUiLanguage(code)?.code;
  if (!resolved) return;
  const store = safeLocalStorage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, resolved);
  } catch {
    /* quota / privacy mode — ignore */
  }
}

/**
 * Map a BCP-47 tag from `navigator.languages` to a supported UI code.
 * Mirrors the Chinese variant chain used by i18next (`resources.fallbackLng`)
 * so `zh-CN`/`zh-SG` land on `zh-Hans` and `zh-TW`/`zh-HK`/`zh-MO` on `zh-Hant`.
 */
export function resolveBrowserTag(tag: string | undefined | null): string | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();

  const exact = UI_LANGUAGES.find((l) => l.code.toLowerCase() === lower);
  if (exact) return exact.code;

  if (lower === 'zh' || lower.startsWith('zh-')) {
    if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo') return 'zh-Hant';
    return 'zh-Hans';
  }

  const base = lower.split('-')[0];
  return UI_LANGUAGES.find((l) => l.code.toLowerCase() === base)?.code ?? null;
}

export function matchBrowserLanguage(nav?: {
  languages?: readonly string[];
  language?: string;
}): string | null {
  const source =
    nav ??
    (typeof navigator !== 'undefined'
      ? { languages: navigator.languages, language: navigator.language }
      : undefined);
  if (!source) return null;

  const prefs =
    source.languages && source.languages.length > 0
      ? source.languages
      : source.language
        ? [source.language]
        : [];

  for (const tag of prefs) {
    const resolved = resolveBrowserTag(tag);
    if (resolved) return resolved;
  }
  return null;
}

export interface AutoRedirectContext {
  pathname: string;
  search: string;
  hash: string;
  saved: string | null;
  browser: string | null;
  sessionFlag: boolean;
}

export interface AutoRedirectDecision {
  /** Target UI language code the app should initialize with. */
  target: string;
  /** Path to navigate to, or `null` to stay on the current URL. */
  redirectTo: string | null;
  /** Language code to persist to localStorage, if any. */
  persist: string | null;
}

/**
 * Pure decision function — no I/O, easy to unit-test. See `maybeAutoRedirect`
 * for the effectful wrapper that reads/writes storage and `window.location`.
 */
export function decideAutoRedirect(ctx: AutoRedirectContext): AutoRedirectDecision {
  const urlLang =
    detectQueryLanguage(ctx.search) ?? detectPathLanguage(ctx.pathname);

  // Explicit URL choice wins and is persisted, no redirect.
  if (urlLang) {
    return { target: urlLang, redirectTo: null, persist: urlLang };
  }

  // Already redirected this session — respect whatever URL we're on now.
  if (ctx.sessionFlag) {
    return { target: DEFAULT_UI_LANGUAGE, redirectTo: null, persist: null };
  }

  const target = ctx.saved ?? ctx.browser ?? DEFAULT_UI_LANGUAGE;
  if (target === DEFAULT_UI_LANGUAGE) {
    return { target: DEFAULT_UI_LANGUAGE, redirectTo: null, persist: null };
  }

  const nextPath = localizedPath(target);
  if (nextPath === ctx.pathname) {
    return { target, redirectTo: null, persist: null };
  }

  return {
    target,
    redirectTo: `${nextPath}${ctx.search}${ctx.hash}`,
    persist: null,
  };
}

/**
 * Runs once at app startup, before React hydrates. If the visitor landed on a
 * URL without an explicit language and their saved/browser preference differs
 * from the default, navigate to the localized path. Returns `true` when a
 * redirect was issued so the caller can skip hydration.
 */
export function maybeAutoRedirect(): boolean {
  if (typeof window === 'undefined') return false;

  const session = safeSessionStorage();
  const sessionFlag = session?.getItem(SESSION_FLAG) === '1';

  const decision = decideAutoRedirect({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    saved: readSavedLanguage(),
    browser: matchBrowserLanguage(),
    sessionFlag,
  });

  if (decision.persist) saveLanguage(decision.persist);

  if (!decision.redirectTo) return false;

  try {
    session?.setItem(SESSION_FLAG, '1');
  } catch {
    /* ignore */
  }

  window.location.replace(decision.redirectTo);
  return true;
}
