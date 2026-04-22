import { defineConfig, globalIgnores } from 'eslint/config';
import nextTs from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The app renders user-provided blob/data URLs and exported images, so
      // `next/image` is not a safe drop-in replacement for every surface.
      '@next/next/no-img-element': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'dist-ssr/**',
    'dev-dist/**',
    'node_modules/**',
    'next-env.d.ts',
  ]),
]);
