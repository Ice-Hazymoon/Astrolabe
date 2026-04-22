import { notFound } from 'next/navigation';
import { AppPage } from '@/app-page';
import { isSupportedUiLanguage } from '@/i18n/languages';
import { getJsonLd } from '@/i18n/server';

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isSupportedUiLanguage(lang)) {
    notFound();
  }

  const jsonLd = await getJsonLd(lang);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AppPage />
    </>
  );
}
