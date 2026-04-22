import { describe, expect, test } from 'bun:test';
import {
  decideAutoRedirect,
  matchBrowserLanguage,
  resolveBrowserTag,
} from './autoRedirect';

describe('resolveBrowserTag', () => {
  test('maps Chinese regional tags to written-form variants', () => {
    expect(resolveBrowserTag('zh-CN')).toBe('zh-Hans');
    expect(resolveBrowserTag('zh-SG')).toBe('zh-Hans');
    expect(resolveBrowserTag('zh')).toBe('zh-Hans');
    expect(resolveBrowserTag('zh-TW')).toBe('zh-Hant');
    expect(resolveBrowserTag('zh-HK')).toBe('zh-Hant');
    expect(resolveBrowserTag('zh-MO')).toBe('zh-Hant');
  });

  test('drops region subtag when only base language is supported', () => {
    expect(resolveBrowserTag('en-US')).toBe('en');
    expect(resolveBrowserTag('pt-BR')).toBe('pt');
    expect(resolveBrowserTag('fr-CA')).toBe('fr');
  });

  test('returns null for unsupported languages', () => {
    expect(resolveBrowserTag('sv-SE')).toBeNull();
    expect(resolveBrowserTag('eo')).toBeNull();
    expect(resolveBrowserTag('')).toBeNull();
    expect(resolveBrowserTag(null)).toBeNull();
  });

  test('accepts exact supported codes case-insensitively', () => {
    expect(resolveBrowserTag('ja')).toBe('ja');
    expect(resolveBrowserTag('AR')).toBe('ar');
  });
});

describe('matchBrowserLanguage', () => {
  test('returns first supported tag from navigator.languages', () => {
    expect(
      matchBrowserLanguage({ languages: ['eo', 'zh-CN', 'en-US'] }),
    ).toBe('zh-Hans');
  });

  test('falls back to navigator.language when languages is empty', () => {
    expect(matchBrowserLanguage({ languages: [], language: 'ja-JP' })).toBe('ja');
  });

  test('returns null when no entry is supported', () => {
    expect(matchBrowserLanguage({ languages: ['eo', 'la'] })).toBeNull();
  });
});

describe('decideAutoRedirect', () => {
  const base = { pathname: '/', search: '', hash: '', saved: null, browser: null, sessionFlag: false };

  test('explicit URL language wins and is persisted without redirect', () => {
    const d = decideAutoRedirect({
      ...base,
      pathname: '/lang/ja/',
      saved: 'fr',
      browser: 'de',
    });
    expect(d.redirectTo).toBeNull();
    expect(d.persist).toBe('ja');
    expect(d.target).toBe('ja');
  });

  test('query parameter also counts as explicit', () => {
    const d = decideAutoRedirect({ ...base, search: '?lang=de' });
    expect(d.redirectTo).toBeNull();
    expect(d.persist).toBe('de');
  });

  test('saved preference redirects from default root', () => {
    const d = decideAutoRedirect({ ...base, saved: 'zh-Hans' });
    expect(d.redirectTo).toBe('/lang/zh-Hans/');
    expect(d.persist).toBeNull();
  });

  test('browser language is used when nothing saved', () => {
    const d = decideAutoRedirect({ ...base, browser: 'fr' });
    expect(d.redirectTo).toBe('/lang/fr/');
  });

  test('saved overrides browser language', () => {
    const d = decideAutoRedirect({ ...base, saved: 'ja', browser: 'fr' });
    expect(d.redirectTo).toBe('/lang/ja/');
  });

  test('no redirect when resolved target is default English', () => {
    const d = decideAutoRedirect({ ...base, browser: 'en' });
    expect(d.redirectTo).toBeNull();
  });

  test('session flag suppresses auto-redirect (loop guard)', () => {
    const d = decideAutoRedirect({
      ...base,
      saved: 'zh-Hans',
      sessionFlag: true,
    });
    expect(d.redirectTo).toBeNull();
  });

  test('preserves query and hash when redirecting', () => {
    const d = decideAutoRedirect({
      ...base,
      search: '?source=share',
      hash: '#preview',
      browser: 'ja',
    });
    expect(d.redirectTo).toBe('/lang/ja/?source=share#preview');
  });

  test('no redirect when already on target localized path', () => {
    const d = decideAutoRedirect({
      ...base,
      pathname: '/lang/fr/',
      // path is already explicit → hits the early return above, but double-check
      // with an implausible combo where detectPathLanguage returned null
      saved: 'fr',
    });
    // /lang/fr/ is an explicit URL language so we persist and don't redirect
    expect(d.redirectTo).toBeNull();
    expect(d.persist).toBe('fr');
  });
});
