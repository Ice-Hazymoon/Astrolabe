import {
  DEFAULT_UI_LANGUAGE,
  NAMESPACES,
  SUPPORTED_CODES,
  isSupportedUiLanguage,
  type Namespace,
  type UiLanguageCode,
} from './languages';

type DictionaryValue = Record<string, unknown>;
type NamespaceLoader = () => Promise<DictionaryValue>;
type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export type NamespaceResources = Partial<Record<Namespace, DictionaryValue>>;

export const CLIENT_MESSAGE_NAMESPACES = [
  'common',
  'app',
  'upload',
  'preview',
  'processing',
  'result',
  'viewer',
  'error',
  'parameters',
  'history',
  'export',
  'share',
  'catalog',
] as const satisfies readonly Namespace[];

const dictionaryLoaders = Object.fromEntries(
  NAMESPACES.map((namespace) => [
    namespace,
    Object.fromEntries(
      SUPPORTED_CODES.map((locale) => [
        locale,
        () =>
          import(`./locales/${locale}/${namespace}.json`).then(
            (module) => module.default as DictionaryValue,
          ),
      ]),
    ),
  ]),
) as Record<Namespace, Record<UiLanguageCode, NamespaceLoader>>;

function isPlainObject(value: unknown): value is DictionaryValue {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const PLURAL_CATEGORIES = new Set<PluralCategory>([
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
]);

function normalizeMessageString(value: string): string {
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, '{$1}');
}

function buildPluralMessage(
  baseKey: string,
  baseValue: string | undefined,
  forms: Partial<Record<PluralCategory, string>>,
): string {
  const normalizedForms: Partial<Record<PluralCategory, string>> = {...forms};

  if (baseValue) {
    normalizedForms.one ??= baseValue;
    normalizedForms.other ??= baseValue;
  }

  if (!normalizedForms.other) {
    const fallback =
      normalizedForms.one ??
      normalizedForms.few ??
      normalizedForms.many ??
      normalizedForms.two ??
      normalizedForms.zero;

    if (fallback) {
      normalizedForms.other = fallback;
    }
  }

  const clauses = Object.entries(normalizedForms)
    .map(([category, message]) => `${category} {${message}}`)
    .join(' ');

  if (!clauses) {
    return baseValue ?? baseKey;
  }

  return `{count, plural, ${clauses}}`;
}

function normalizeDictionary(value: unknown): unknown {
  if (typeof value === 'string') {
    return normalizeMessageString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDictionary(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const normalizedEntries = Object.entries(value).map(([key, child]) => [
    key,
    normalizeDictionary(child),
  ] as const);

  const normalizedObject: DictionaryValue = Object.fromEntries(normalizedEntries);
  const pluralGroups = new Map<
    string,
    Partial<Record<PluralCategory, string>>
  >();

  for (const [key, child] of normalizedEntries) {
    if (typeof child !== 'string') continue;

    const match = key.match(/^(.*)_(zero|one|two|few|many|other)$/);
    if (!match) continue;

    const [, baseKey, category] = match;
    if (!PLURAL_CATEGORIES.has(category as PluralCategory)) continue;

    const group = pluralGroups.get(baseKey) ?? {};
    group[category as PluralCategory] = child;
    pluralGroups.set(baseKey, group);
    delete normalizedObject[key];
  }

  for (const [baseKey, forms] of pluralGroups) {
    const baseValue =
      typeof normalizedObject[baseKey] === 'string'
        ? (normalizedObject[baseKey] as string)
        : undefined;

    normalizedObject[baseKey] = buildPluralMessage(baseKey, baseValue, forms);
  }

  return normalizedObject;
}

function mergeDictionaries(
  fallback: DictionaryValue,
  localized: DictionaryValue,
): DictionaryValue {
  const merged: DictionaryValue = { ...fallback };

  for (const [key, value] of Object.entries(localized)) {
    const fallbackValue = merged[key];

    if (isPlainObject(fallbackValue) && isPlainObject(value)) {
      merged[key] = mergeDictionaries(fallbackValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function resolveLocale(locale: string): UiLanguageCode {
  return isSupportedUiLanguage(locale) ? locale : DEFAULT_UI_LANGUAGE;
}

async function loadNamespace(
  locale: UiLanguageCode,
  namespace: Namespace,
): Promise<DictionaryValue> {
  const dictionary = await dictionaryLoaders[namespace][locale]();
  return normalizeDictionary(dictionary) as DictionaryValue;
}

async function loadMergedNamespace(
  locale: UiLanguageCode,
  namespace: Namespace,
): Promise<DictionaryValue> {
  if (locale === DEFAULT_UI_LANGUAGE) {
    return loadNamespace(DEFAULT_UI_LANGUAGE, namespace);
  }

  const [fallback, localized] = await Promise.all([
    loadNamespace(DEFAULT_UI_LANGUAGE, namespace),
    loadNamespace(locale, namespace),
  ]);

  return mergeDictionaries(fallback, localized);
}

export async function loadLocaleNamespaces(
  locale: string,
  namespaces: readonly Namespace[],
): Promise<{ locale: UiLanguageCode; messages: NamespaceResources }> {
  const resolvedLocale = resolveLocale(locale);
  const uniqueNamespaces = [...new Set(namespaces)];
  const entries = await Promise.all(
    uniqueNamespaces.map(async (namespace) => [
      namespace,
      await loadMergedNamespace(resolvedLocale, namespace),
    ] as const),
  );

  return {
    locale: resolvedLocale,
    messages: Object.fromEntries(entries),
  };
}
