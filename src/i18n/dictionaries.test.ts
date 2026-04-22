import { describe, expect, test } from 'bun:test';
import { createTranslator } from 'use-intl/core';
import { loadLocaleNamespaces } from './dictionaries';

describe('loadLocaleNamespaces', () => {
  test('loads the requested localized namespace', async () => {
    const payload = await loadLocaleNamespaces('fr', ['common']);

    expect(payload.locale).toBe('fr');
    expect(
      (payload.messages.common as { actions: { close: string } }).actions.close,
    ).toBe('Fermer');
  });

  test('falls back to the default locale for unsupported requests', async () => {
    const payload = await loadLocaleNamespaces('xx', ['common']);

    expect(payload.locale).toBe('en');
    expect(
      (payload.messages.common as { actions: { close: string } }).actions.close,
    ).toBe('Close');
  });

  test('deep-merges missing localized keys with the English fallback', async () => {
    const payload = await loadLocaleNamespaces('ar', ['celestial']);

    expect(payload.locale).toBe('ar');
    expect(
      (payload.messages.celestial as { alpha_centauri: string }).alpha_centauri,
    ).toBe('Alpha Centauri');
  });

  test('normalizes legacy interpolation syntax to ICU messages', async () => {
    const payload = await loadLocaleNamespaces('en', ['history']);
    const translator = createTranslator({
      locale: payload.locale,
      messages: payload.messages,
    });

    expect(
      (translator as (key: string, values?: Record<string, unknown>) => string)(
        'history.restore',
        {name: 'Orion'},
      ),
    ).toBe('Restore · Orion');
  });

  test('normalizes i18next plural suffixes into ICU plural messages', async () => {
    const payload = await loadLocaleNamespaces('en', ['result']);
    const translator = createTranslator({
      locale: payload.locale,
      messages: payload.messages,
    });

    expect(
      (translator as (key: string, values?: Record<string, unknown>) => string)(
        'result.details.mainStarsCount',
        {count: 1},
      ),
    ).toBe(
      '1 main star',
    );
    expect(
      (translator as (key: string, values?: Record<string, unknown>) => string)(
        'result.details.mainStarsCount',
        {count: 3},
      ),
    ).toBe(
      '3 main stars',
    );
  });
});
