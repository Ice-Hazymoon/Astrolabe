import type { MetadataRoute } from 'next';
import { SITE_NAME, absoluteUrl } from '@/lib/config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Star Annotator`,
    short_name: SITE_NAME,
    description:
      'Identify constellations, stars, and deep-sky objects in night-sky photos through astrometric plate solving.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b0e16',
    theme_color: '#0b0e16',
    categories: ['photo', 'utilities', 'productivity', 'education'],
    icons: [
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    screenshots: [
      {
        src: absoluteUrl('/samples/output.png'),
        sizes: '1024x1024',
        type: 'image/png',
      },
    ],
  };
}
