import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: '/en',
        destination: '/',
        permanent: true,
      },
      {
        source: '/en/:path*',
        destination: '/:path*',
        permanent: true,
      },
      {
        source: '/lang/en',
        destination: '/',
        permanent: true,
      },
      {
        source: '/lang/en/:path*',
        destination: '/:path*',
        permanent: true,
      },
      {
        source: '/lang/:lang',
        destination: '/:lang',
        permanent: true,
      },
      {
        source: '/lang/:lang/:path*',
        destination: '/:lang/:path*',
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
