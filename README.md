# Stellaris

Stellaris is a single-page React application for annotating night-sky photos. Upload an image, send it to a compatible sky-analysis API, and explore the returned stars, constellations, and deep-sky objects with an interactive overlay viewer.

## Highlights

- Single-flow UI: upload, preview, analyze, inspect, export
- Overlay presets plus per-layer controls for stars, constellations, and deep-sky objects
- Zoomable result viewer with fullscreen mode
- Export strip with location metadata and social-share flow
- Local history for recent analyses
- 19 UI languages with localized routes under `/lang/<code>/`
- Prerendered SEO pages with canonical and hreflang metadata
- PWA manifest, icons, and Open Graph assets

## Stack

- React 19
- TypeScript
- Vite 6
- Tailwind CSS 4
- Zustand
- i18next + react-i18next

## Requirements

- [Bun](https://bun.sh/) 1.x
- A backend API compatible with the app's `healthz` and analysis endpoints

By default, the app expects the API at `http://localhost:3000`.

## Getting Started

1. Install dependencies:

   ```bash
   bun install
   ```

2. Configure environment variables as needed:

   ```bash
   VITE_API_BASE_URL=http://localhost:3000
   VITE_SITE_URL=https://stellaris.app
   VITE_SITE_NAME=Stellaris
   ```

3. Start the development server:

   ```bash
   bun run dev
   ```

4. Open the app at [http://localhost:5173](http://localhost:5173).

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the Vite dev server |
| `bun run check` | Run type-checking and ESLint |
| `bun run build` | Build the client, build the SSR bundle, and prerender localized HTML |
| `bun run build:spa` | Build the client as a plain SPA without the prerender step |
| `bun run preview` | Preview the production build locally |

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Base URL for the analysis API |
| `VITE_SITE_URL` | `https://stellaris.app` | Public site origin used for canonical, hreflang, sitemap, and share URLs |
| `VITE_SITE_NAME` | `Stellaris` | Brand name used in metadata and the web app manifest |

## Build Output

`bun run build` produces:

- `dist/`: static assets, prerendered locale pages, sitemap, robots file, and PWA files
- `dist-ssr/`: the SSR bundle used by the prerender step

The default route is `/`, and non-default locales are emitted as `/lang/<code>/`.

## Project Structure

```text
.
├── public/          # static assets, icons, and sample images
├── scripts/         # prerender script
├── src/
│   ├── components/  # UI building blocks and screens
│   ├── data/        # default overlay presets and locale lists
│   ├── i18n/        # locale resources, routing, and SEO helpers
│   ├── lib/         # API client, export helpers, rendering helpers
│   ├── state/       # Zustand store
│   └── types/       # API and rendering types
├── plugins/         # Vite metadata plugin
└── vite.config.ts
```

## Notes

- The app is intentionally a one-page experience; additional states are loaded lazily as needed.
- If the API is unavailable, the client can fall back to bundled mock analysis data so the UI remains usable during development.
- For production deployment, make sure the backend allows requests from the frontend origin configured via `VITE_SITE_URL`.
