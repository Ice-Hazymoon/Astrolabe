import { describe, expect, test } from 'bun:test';
import { detectInitialUiLanguage, detectQueryLanguage, detectUrlUiLanguage } from './browserUrl';

describe('browserUrl language detection', () => {
  test('query parameter wins over path and document language', () => {
    expect(
      detectInitialUiLanguage({
        pathname: '/lang/fr/',
        search: '?lang=ja',
        htmlLang: 'en',
      }),
    ).toBe('ja');
  });

  test('falls back to localized pathname when query is absent', () => {
    expect(detectInitialUiLanguage({ pathname: '/lang/zh-Hans/', search: '' })).toBe('zh-Hans');
    expect(detectUrlUiLanguage('/lang/pt/', '')).toBe('pt');
  });

  test('falls back to prerendered html lang and then default english', () => {
    expect(detectInitialUiLanguage({ pathname: '/', search: '', htmlLang: 'de' })).toBe('de');
    expect(detectInitialUiLanguage({ pathname: '/', search: '', htmlLang: '' })).toBe('en');
  });

  test('ignores unsupported query languages', () => {
    expect(detectQueryLanguage('?lang=xx')).toBeNull();
    expect(detectUrlUiLanguage('/', '?lang=xx')).toBe('en');
  });
});
