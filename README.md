# Stellaris

Stellaris is a Next.js 16 App Router application for annotating night-sky photos. Upload an image, send it to a compatible sky-analysis API, and inspect the returned stars, constellations, and deep-sky objects with an interactive overlay viewer.

## Highlights

- Single-flow UI for upload, preview, analysis, inspection, export, and share
- 19 language routes under `/{lang}` with locale detection handled by `proxy.ts`
- Next.js metadata APIs for canonical URLs, hreflang alternates, robots, sitemap, and social cards
- Dynamic OG/Twitter image generation with `next/og`
- PWA manifest + service worker implemented with Next.js App Router conventions
- Existing Zustand state, export pipeline, history, and overlay rendering preserved through the rewrite

## Stack

- Next.js 16.2.4
- React 19.2.5
- TypeScript 5.9
- Tailwind CSS 4
- Zustand

## Requirements

- [Bun](https://bun.sh/) 1.x
- Node.js 20.9+ for Next.js 16
- A backend API compatible with the app's `healthz` and analysis endpoints

By default, the app targets `https://constellate-api.imiku.me`. Override it in local development as needed.

## Getting Started

1. Install dependencies:

   ```bash
   bun install
   ```

2. Configure environment variables:

   ```bash
   NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
   NEXT_PUBLIC_SITE_URL=https://stellaris.app
   NEXT_PUBLIC_SITE_NAME=Stellaris
   ```

   Legacy `VITE_*` variables are still accepted during the migration, but `NEXT_PUBLIC_*` is now the primary interface.

3. Start the development server:

   ```bash
   bun run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the Next.js dev server |
| `bun run build` | Build the production app |
| `bun run start` | Start the production server |
| `bun run test` | Run Bun tests |
| `bun run check` | Run tests, type-checking, ESLint, and i18n validation |

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `https://constellate-api.imiku.me` | Base URL for the analysis API |
| `NEXT_PUBLIC_SITE_URL` | `https://stellaris.app` | Public origin used by metadata, sitemap, and share URLs |
| `NEXT_PUBLIC_SITE_NAME` | `Stellaris` | Brand name used in metadata and manifest |

## Project Structure

```text
.
├── app/             # App Router pages, metadata files, API routes
├── public/          # static assets, icons, samples, service worker
├── scripts/         # locale and maintenance scripts
├── src/
│   ├── components/  # UI building blocks and screens
│   ├── data/        # default overlay presets and locale lists
│   ├── i18n/        # locale resources and runtime/server helpers
│   ├── lib/         # API client, export helpers, rendering helpers
│   ├── state/       # Zustand store
│   └── types/       # shared app types
├── next.config.ts
└── proxy.ts
```

## Notes

- The app still behaves as a single-page tool, but routing, metadata, and localization now use the App Router.
- UI translation bundles are loaded server-side for the active locale, while additional label locales are fetched on demand when users switch celestial-label language.
- For production deployment, make sure the backend allows requests from the frontend origin configured via `NEXT_PUBLIC_SITE_URL`.
