import {getRequestConfig} from 'next-intl/server';
import {CLIENT_MESSAGE_NAMESPACES, loadLocaleNamespaces} from './dictionaries';
import {DEFAULT_UI_LANGUAGE, isSupportedUiLanguage} from './languages';

export default getRequestConfig(async ({locale, requestLocale}) => {
  const requestedLocale = locale ?? (await requestLocale);
  const resolvedLocale = isSupportedUiLanguage(requestedLocale)
    ? requestedLocale
    : DEFAULT_UI_LANGUAGE;
  const payload = await loadLocaleNamespaces(
    resolvedLocale,
    CLIENT_MESSAGE_NAMESPACES,
  );

  return {
    locale: payload.locale,
    messages: payload.messages,
  };
});
