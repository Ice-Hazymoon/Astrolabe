'use client';

import {useLocale, useMessages} from 'next-intl';
import {createTranslator} from 'use-intl/core';
import {useEffect, useMemo, useState} from 'react';
import {loadLocaleNamespaces, type NamespaceResources} from './dictionaries';
import {type Namespace} from './languages';

interface TranslateOptions {
  defaultValue?: string;
  [key: string]: unknown;
}

function normalizeNamespaces(
  value?: Namespace | Namespace[] | string | string[],
): Namespace[] {
  if (!value) return ['common'];
  if (Array.isArray(value)) return value as Namespace[];
  return [value as Namespace];
}

function resolveMessageKeys(rawKey: string, namespaces: Namespace[]): string[] {
  if (rawKey.includes(':')) {
    const [namespace, nestedKey] = rawKey.split(/:(.+)/, 2);
    return [`${namespace}.${nestedKey}`];
  }

  return namespaces.map((namespace) => `${namespace}.${rawKey}`);
}

function hasMessageKey(messages: unknown, key: string): boolean {
  let current = messages;

  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string';
}

export function useTranslation(
  namespaces?: Namespace | Namespace[] | string | string[],
) {
  const locale = useLocale();
  const messages = useMessages() as Record<string, unknown>;
  const normalizedNamespaces = useMemo(
    () => normalizeNamespaces(namespaces),
    [namespaces],
  );
  const translator = useMemo(
    () => createTranslator({locale, messages}),
    [locale, messages],
  );

  const t = useMemo(
    () => (key: string, options?: TranslateOptions) => {
      for (const messageKey of resolveMessageKeys(key, normalizedNamespaces)) {
        if (hasMessageKey(messages, messageKey)) {
          return translator(messageKey as never, options as never);
        }
      }

      return options?.defaultValue ?? key;
    },
    [messages, normalizedNamespaces, translator],
  );

  return {locale, t};
}

export function useCelestialTranslation(locale: string) {
  const [state, setState] = useState<{
    locale: string | null;
    messages: NamespaceResources | null;
  }>({
    locale: null,
    messages: null,
  });

  useEffect(() => {
    let cancelled = false;

    void loadLocaleNamespaces(locale, ['celestial']).then((payload) => {
      if (!cancelled) {
        setState({
          locale: payload.locale,
          messages: payload.messages,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const messages = state.locale === locale ? state.messages : null;

  const translator = useMemo(
    () =>
      createTranslator({
        locale,
        messages: messages ?? {},
      }),
    [locale, messages],
  );

  return useMemo(
    () => (key: string, options?: TranslateOptions) => {
      if (hasMessageKey(messages, `celestial.${key}`)) {
        return translator(`celestial.${key}` as never, options as never);
      }

      return options?.defaultValue ?? key;
    },
    [messages, translator],
  );
}
