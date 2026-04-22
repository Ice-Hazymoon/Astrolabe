import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getLocaleSeo } from '@/i18n/server';
import {
  DEFAULT_UI_LANGUAGE,
  SUPPORTED_CODES,
  findUiLanguage,
  isSupportedUiLanguage,
} from '@/i18n/languages';
import { getLocalePath, routing } from '@/i18n/routing';
import { SITE_NAME, SITE_URL } from '@/lib/config';
import '@/styles/global.css';

export function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isSupportedUiLanguage(lang)) return {};

  const seo = await getLocaleSeo(lang);
  const languages = Object.fromEntries(
    SUPPORTED_CODES.map((code) => [code, getLocalePath(code)]),
  );
  const localePath = getLocalePath(lang);
  const socialImagePath = '/og-cover.png';

  return {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords.split(',').map((value) => value.trim()),
    alternates: {
      canonical: localePath,
      languages: {
        ...languages,
        'x-default': getLocalePath(DEFAULT_UI_LANGUAGE),
      },
    },
    openGraph: {
      type: 'website',
      locale: seo.ogLocale,
      siteName: seo.siteName,
      title: seo.title,
      description: seo.description,
      url: localePath,
      images: [
        {
          url: socialImagePath,
          width: 1200,
          height: 630,
          alt: seo.ogImageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title,
      description: seo.description,
      images: [socialImagePath],
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  if (!isSupportedUiLanguage(lang)) {
    notFound();
  }

  const locale = findUiLanguage(lang);
  if (!locale) {
    notFound();
  }

  setRequestLocale(locale.code);
  const messages = await getMessages();

  return (
    <html lang={locale.code} dir={locale.dir}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
