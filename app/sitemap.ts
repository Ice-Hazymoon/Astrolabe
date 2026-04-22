import type { MetadataRoute } from 'next';
import { SUPPORTED_CODES } from '@/i18n/languages';
import { getLocalePath } from '@/i18n/routing';
import { absoluteUrl } from '@/lib/config';

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    SUPPORTED_CODES.map((code) => [code, absoluteUrl(getLocalePath(code))]),
  );

  return [
    ...SUPPORTED_CODES.map((lang) => ({
      url: absoluteUrl(getLocalePath(lang)),
      lastModified: new Date(),
      alternates: {
        languages,
      },
    })),
  ];
}
