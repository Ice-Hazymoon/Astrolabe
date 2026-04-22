import type {
  OverlayDeepSkyMarker,
  OverlayLineSegment,
  OverlayOptions,
  OverlayScene,
  OverlayStarMarker,
  OverlayTextItem,
  RgbaTuple,
} from '../types/api';
import type { DetailsFilters } from '../state/store';
import { applyDetailsFilters } from './detailsFilter';
import { logoSvgMarkup } from './logoMarkup';

// Shared "no filter active" sentinel so callers that haven't wired filters yet
// (and our own default-arg path) skip the filtering step with a single
// identity-compare inside applyDetailsFilters — no new allocations.
const NO_FILTERS: DetailsFilters = {
  starsHidden: new Set<string>(),
  starSolo: null,
  constellationsHidden: new Set<string>(),
  constellationSolo: null,
  dsosHidden: new Set<string>(),
  dsoSolo: null,
};

/**
 * Rasterize the original image + the current overlay scene into a single PNG blob URL.
 * Canvas is sized to the scene's native dimensions (which match the uploaded image),
 * so the exported PNG preserves the user's original resolution and aspect ratio —
 * only the overlay layer is added.
 *
 * `filters` (optional) hides/solos individual stars/constellations/DSOs so the
 * export mirrors what the live viewer paints. Uses the same rules as
 * OverlayCanvas — see `applyDetailsFilters` in `detailsFilter.ts`.
 */
export async function composeAnnotated(
  imageSrc: string,
  scene: OverlayScene,
  layers: OverlayOptions['layers'],
  filters: DetailsFilters = NO_FILTERS,
): Promise<string> {
  const img = await loadImage(imageSrc);
  const width = scene.image_width > 0 ? scene.image_width : img.naturalWidth;
  const height = scene.image_height > 0 ? scene.image_height : img.naturalHeight;
  if (!width || !height) throw new Error('missing image dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const filteredScene = applyDetailsFilters(scene, filters);
  const markup = buildOverlaySvg(
    { ...filteredScene, image_width: width, image_height: height },
    layers,
  );
  const svgUrl = svgToObjectUrl(markup);
  try {
    const svgImg = await loadImage(svgUrl);
    ctx.drawImage(svgImg, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('canvas.toBlob failed');
  return URL.createObjectURL(blob);
}

// --- Annotated export with a bottom attribution strip ----------------------

export interface StripMeta {
  /** Free-text place name, e.g. "北京·怀柔". Empty string = caller is leaving it blank. */
  locationName: string;
  /** Pre-formatted coordinate string, e.g. "39.9042°N  116.4074°E". */
  coordinates: string;
  /** Brand wordmark, e.g. "STELLARIS". */
  siteName: string;
  /** Short site tagline, e.g. "星空标注". */
  siteTagline?: string;
  /** Site URL shown on the right, e.g. "stellaris.app". */
  siteUrl: string;
  /** Catalog summary rendered as a three-column stats band in the middle of the strip. */
  stats?: {
    stars: number;
    constellations: number;
    deepSky: number;
    labels?: {
      stars: string;
      constellations: string;
      deepSky: string;
    };
  };
}

/**
 * Rasterize the annotated image AND (optionally) a dark attribution strip at
 * the bottom (location name, coordinates, site logo + wordmark + URL) as a
 * single PNG blob URL. This is the "share-ready" export used by the save
 * dialog. When `includeStrip` is false, only the photo + overlay is produced.
 */
export async function composeAnnotatedWithStrip(
  imageSrc: string,
  scene: OverlayScene,
  layers: OverlayOptions['layers'],
  meta: StripMeta,
  filters: DetailsFilters = NO_FILTERS,
  includeStrip = true,
): Promise<string> {
  const img = await loadImage(imageSrc);
  const W = scene.image_width > 0 ? scene.image_width : img.naturalWidth;
  const H = scene.image_height > 0 ? scene.image_height : img.naturalHeight;
  if (!W || !H) throw new Error('missing image dimensions');

  const stripH = includeStrip ? stripHeightFor(W) : 0;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H + stripH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  // Photo
  ctx.drawImage(img, 0, 0, W, H);

  // Overlay layer (same SVG the live viewer paints). Apply per-item visibility
  // filters so the export mirrors the user's hide/solo selections in the
  // ResultDetailsSheet — see applyDetailsFilters / OverlayCanvas.
  const filteredScene = applyDetailsFilters(scene, filters);
  const overlay = buildOverlaySvg(
    { ...filteredScene, image_width: W, image_height: H },
    layers,
  );
  const overlayUrl = svgToObjectUrl(overlay);
  try {
    const overlayImg = await loadImage(overlayUrl);
    ctx.drawImage(overlayImg, 0, 0, W, H);
  } finally {
    URL.revokeObjectURL(overlayUrl);
  }

  if (includeStrip) {
    // Bottom attribution strip
    await ensureFontsReady();
    const stripSvg = buildStripSvg(W, stripH, meta);
    const stripUrl = svgToObjectUrl(stripSvg);
    try {
      const stripImg = await loadImage(stripUrl);
      ctx.drawImage(stripImg, 0, H, W, stripH);
    } finally {
      URL.revokeObjectURL(stripUrl);
    }
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('canvas.toBlob failed');
  return URL.createObjectURL(blob);
}

/**
 * Strip height scales with the image's long edge so typography always reads at
 * the same visual weight relative to the photo. Clamped so thumbnails still
 * look deliberate and 8K panoramas don't have the strip dominate the frame.
 */
export function stripHeightFor(imageWidth: number): number {
  return Math.round(Math.max(240, Math.min(imageWidth * 0.145, 440)));
}

// Dark "observatory plaque" strip — matches the app's night-sky palette so the
// exported frame reads as a cinematic credit panel instead of a paper cutout.
// Three regions share the baseline by whitespace alone:
//   • left:   logo glyph + wordmark, URL tucked beneath
//   • center: location name (hero) + coordinates
//   • right:  three stat pillars (number over small-caps label)
// A single hairline up top is the only decoration — no vertical dividers, no
// stats row separator, no short horizontal rules.

interface StripPalette {
  bgTop: string;
  bgBot: string;
  hairline: string;
  text: string;
  textSoft: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
}

const STRIP_PALETTE: StripPalette = {
  bgTop: '#0A0C14',
  bgBot: '#141726',
  hairline: '#E6B87A',
  text: '#EDEEF4',
  textSoft: '#A5A7B2',
  textMuted: '#70727C',
  accent: '#E6B87A',
  accentSoft: '#C79A5E',
};

const STRIP_SERIF = `'Spectral','Noto Serif SC','Iowan Old Style',Georgia,serif`;
const STRIP_MONO = `'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace`;

export function buildStripSvg(W: number, H: number, meta: StripMeta): string {
  const palette = STRIP_PALETTE;

  // Outer padding: the flanking columns hug the edges without touching them,
  // leaving a comfortable rail of space on both sides of the strip.
  const padX = Math.round(Math.max(H * 0.32, W * 0.024));
  const innerW = Math.max(0, W - padX * 2);

  // Typography — scaled for a two-row layout: the location hero gets row 1
  // to itself, while row 2 packs brand + stats into a denser metadata band.
  const fs = {
    wordmark: Math.round(H * 0.14),
    url: Math.round(H * 0.1),
    location: Math.round(H * 0.14),
    coords: Math.round(H * 0.1),
    statNumber: Math.round(H * 0.175),
  };

  const locationName = meta.locationName.trim();
  const coordinates = meta.coordinates.trim();
  const hasLocation = !!locationName || !!coordinates;

  const siteName = (meta.siteName || 'Stellaris').trim();
  const siteUrl = (meta.siteUrl || '').toLowerCase();

  // Layout rules:
  //   hasLocation:  row 1 = [location left | brand right], row 2 = [stats left]
  //   !hasLocation: single row = [stats left | brand right]
  const row1Cy = hasLocation ? H * 0.32 : H * 0.5;
  const row2Cy = H * 0.72;

  // Brand is always right-anchored; size to content, capped at 50% of innerW
  // so a long URL can never hog the row.
  const brandContentW = estimateBrandWidth(fs, H, siteName, siteUrl);
  const brandMaxW = Math.min(brandContentW, innerW * 0.5);

  const rowGap = H * 0.3;
  const statsWidth = meta.stats ? estimateStatsRowWidth(meta.stats, fs, H) : 0;
  const locationMaxW = Math.max(0, innerW - brandMaxW - rowGap);

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(buildStripDefs(palette, H));
  parts.push(`<rect width="${W}" height="${H}" fill="url(#strip-bg)" />`);
  parts.push(buildStripAmbience(W, H, palette));
  parts.push(buildStripHairline(W, palette));

  if (hasLocation) {
    // Row 1 left: location. Row 1 right: brand. Row 2 left: stats.
    parts.push(
      buildStripLocationRow({
        x: padX,
        centerY: row1Cy,
        maxW: locationMaxW,
        H,
        fs,
        palette,
        locationName,
        coordinates,
      }),
    );
    parts.push(
      buildStripBrandRow({
        rightX: W - padX,
        centerY: row1Cy,
        maxW: brandMaxW,
        H,
        fs,
        palette,
        siteName,
        siteUrl,
      }),
    );
    if (meta.stats) {
      parts.push(
        buildStripStatsRow({
          leftX: padX,
          centerY: row2Cy,
          H,
          fs,
          palette,
          stats: meta.stats,
        }),
      );
    }
  } else {
    // Single row: stats left, brand right.
    if (meta.stats) {
      parts.push(
        buildStripStatsRow({
          leftX: padX,
          centerY: H / 2,
          H,
          fs,
          palette,
          stats: meta.stats,
        }),
      );
    }
    const singleRowBrandMaxW = Math.min(
      brandMaxW,
      Math.max(H * 2, innerW - statsWidth - rowGap),
    );
    parts.push(
      buildStripBrandRow({
        rightX: W - padX,
        centerY: H / 2,
        maxW: singleRowBrandMaxW,
        H,
        fs,
        palette,
        siteName,
        siteUrl,
      }),
    );
  }
  parts.push(`</svg>`);
  return parts.join('');
}

// Location + coordinates stack, left-aligned at the padding rail. Long names
// are truncated with a trailing ellipsis instead of wrapping or overflowing.
function buildStripLocationRow(args: {
  x: number;
  centerY: number;
  maxW: number;
  H: number;
  fs: StripFontScale;
  palette: StripPalette;
  locationName: string;
  coordinates: string;
}): string {
  const { x, centerY, maxW, H, fs, palette, locationName, coordinates } = args;
  if (maxW <= 0) return '';

  const nameText = locationName
    ? truncateTextEnd(locationName, maxW, {
        fontSize: fs.location,
        family: 'serif',
        letterSpacingEm: -0.005,
      })
    : '';
  const coordsText = coordinates
    ? truncateTextEnd(coordinates, maxW, {
        fontSize: fs.coords,
        family: 'mono',
        letterSpacingEm: 0.08,
      })
    : '';
  if (!nameText && !coordsText) return '';

  const nameH = nameText ? fs.location * 0.82 : 0;
  const coordsH = coordsText ? fs.coords * 0.82 : 0;
  const stackGap = nameText && coordsText ? H * 0.055 : 0;
  const totalH = nameH + stackGap + coordsH;
  const topY = centerY - totalH / 2;
  const nameCy = topY + nameH / 2;
  const coordsCy = topY + nameH + stackGap + coordsH / 2;

  const name = nameText
    ? `<text x="${x}" y="${nameCy.toFixed(1)}" text-anchor="start" dominant-baseline="central" ` +
      `font-family="${STRIP_SERIF}" font-size="${fs.location}" font-weight="500" ` +
      `fill="${palette.text}" letter-spacing="-0.005em">${esc(nameText)}</text>`
    : '';
  const coords = coordsText
    ? `<text x="${x}" y="${coordsCy.toFixed(1)}" text-anchor="start" dominant-baseline="central" ` +
      `font-family="${STRIP_MONO}" font-size="${fs.coords}" font-weight="400" ` +
      `fill="${palette.accentSoft}" letter-spacing="0.08em">${esc(coordsText)}</text>`
    : '';
  return name + coords;
}

// Brand lockup — logo on the left, stacked wordmark + URL on the right of it.
// Whole unit is right-anchored at `rightX`, vertically centered on `centerY`.
function buildStripBrandRow(args: {
  rightX: number;
  centerY: number;
  maxW: number;
  H: number;
  fs: StripFontScale;
  palette: StripPalette;
  siteName: string;
  siteUrl: string;
}): string {
  const { rightX, centerY, maxW, H, fs, palette, siteName, siteUrl } = args;

  const logoSize = Math.round(H * 0.3);
  const logoScale = logoSize / 32;
  const logoGap = Math.round(H * 0.07);
  const textBudget = Math.max(0, maxW - logoSize - logoGap);

  const wordmarkText = truncateTextEnd(siteName.toUpperCase(), textBudget, {
    fontSize: fs.wordmark,
    family: 'serif',
    letterSpacingEm: 0.26,
  });
  const urlText = siteUrl
    ? truncateTextMiddle(siteUrl, textBudget, {
        fontSize: fs.url,
        family: 'mono',
        letterSpacingEm: 0.04,
      })
    : '';

  // Measure after truncation so the block sizes to what actually renders.
  const wordmarkW = estimateStripTextWidth(wordmarkText, {
    fontSize: fs.wordmark,
    family: 'serif',
    letterSpacingEm: 0.26,
  });
  const urlW = urlText
    ? estimateStripTextWidth(urlText, {
        fontSize: fs.url,
        family: 'mono',
        letterSpacingEm: 0.04,
      })
    : 0;
  const textW = Math.max(wordmarkW, urlW);
  const blockW = logoSize + logoGap + textW;

  const leftX = rightX - blockW;
  const logoX = leftX;
  const logoY = centerY - logoSize / 2;
  const textX = leftX + logoSize + logoGap;

  const wordmarkH = fs.wordmark * 0.82;
  const urlH = urlText ? fs.url * 0.85 : 0;
  const textGap = urlText ? H * 0.04 : 0;
  const stackH = wordmarkH + textGap + urlH;
  const stackTopY = centerY - stackH / 2;
  const wordmarkCy = stackTopY + wordmarkH / 2;
  const urlCy = stackTopY + wordmarkH + textGap + urlH / 2;

  return (
    `<g transform="translate(${logoX.toFixed(1)} ${logoY.toFixed(1)}) scale(${logoScale.toFixed(3)})">` +
      logoSvgMarkup(palette.accent) +
    `</g>` +
    `<text x="${textX.toFixed(1)}" y="${wordmarkCy.toFixed(1)}" text-anchor="start" dominant-baseline="central" ` +
      `font-family="${STRIP_SERIF}" font-size="${fs.wordmark}" font-weight="500" ` +
      `fill="${palette.text}" letter-spacing="0.26em">${esc(wordmarkText)}</text>` +
    (urlText
      ? `<text x="${textX.toFixed(1)}" y="${urlCy.toFixed(1)}" text-anchor="start" dominant-baseline="central" ` +
        `font-family="${STRIP_MONO}" font-size="${fs.url}" font-weight="400" ` +
        `fill="${palette.textMuted}" letter-spacing="0.04em">${esc(urlText)}</text>`
      : '')
  );
}

// Measures the intrinsic width the brand block wants — logo + gap + the
// wider of wordmark/URL. Used up-front so the location/stats block knows
// how much horizontal room is left on the opposite side of the row.
function estimateBrandWidth(
  fs: StripFontScale,
  H: number,
  siteName: string,
  siteUrl: string,
): number {
  const logoSize = Math.round(H * 0.3);
  const logoGap = Math.round(H * 0.07);
  const wordmarkW = estimateStripTextWidth(siteName.toUpperCase(), {
    fontSize: fs.wordmark,
    family: 'serif',
    letterSpacingEm: 0.26,
  });
  const urlW = siteUrl
    ? estimateStripTextWidth(siteUrl, {
        fontSize: fs.url,
        family: 'mono',
        letterSpacingEm: 0.04,
      })
    : 0;
  return logoSize + logoGap + Math.max(wordmarkW, urlW);
}

// Predicts the width the horizontal stats row will consume, so callers can
// reserve the remaining space for the brand block when both share a row.
function estimateStatsRowWidth(
  stats: NonNullable<StripMeta['stats']>,
  fs: StripFontScale,
  H: number,
): number {
  const iconR = H * 0.068;
  const iconToNumber = H * 0.06;
  const betweenStats = H * 0.22;
  const numberMetrics = {
    fontSize: fs.statNumber,
    family: 'serif' as const,
    letterSpacingEm: -0.015,
  };
  const numbers = [stats.stars, stats.constellations, stats.deepSky].map((n) =>
    estimateStripTextWidth(String(n), numberMetrics),
  );
  const pairs = numbers.reduce((sum, nw) => sum + iconR * 2 + iconToNumber + nw, 0);
  return pairs + betweenStats * 2;
}

// Stats laid out horizontally: icon + number pairs with generous gaps
// between pairs. Left-anchored starting at `leftX`.
function buildStripStatsRow(args: {
  leftX: number;
  centerY: number;
  H: number;
  fs: StripFontScale;
  palette: StripPalette;
  stats: NonNullable<StripMeta['stats']>;
}): string {
  const { leftX, centerY, H, fs, palette, stats } = args;

  const iconR = H * 0.068;
  const iconToNumber = H * 0.06;
  const betweenStats = H * 0.22;

  const items = [
    { value: stats.stars, icon: statIconStar },
    { value: stats.constellations, icon: statIconConstellation },
    { value: stats.deepSky, icon: statIconDeepSky },
  ];

  const numberMetrics = {
    fontSize: fs.statNumber,
    family: 'serif' as const,
    letterSpacingEm: -0.015,
  };
  const numberWidths = items.map((item) =>
    estimateStripTextWidth(String(item.value), numberMetrics),
  );
  const pairWidths = numberWidths.map((nw) => iconR * 2 + iconToNumber + nw);

  let cursor = leftX;
  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const { value, icon } = items[i];
    const iconCx = cursor + iconR;
    const numberX = cursor + iconR * 2 + iconToNumber;
    out.push(
      `<g transform="translate(${iconCx.toFixed(1)} ${centerY.toFixed(1)})">${icon(iconR, palette.accent)}</g>`,
      `<text x="${numberX.toFixed(1)}" y="${centerY.toFixed(1)}" text-anchor="start" ` +
        `dominant-baseline="central" font-family="${STRIP_SERIF}" font-size="${fs.statNumber}" ` +
        `font-weight="400" fill="${palette.text}" letter-spacing="-0.015em">${value}</text>`,
    );
    cursor += pairWidths[i] + betweenStats;
  }
  return out.join('');
}

function buildStripDefs(palette: StripPalette, H: number): string {
  const glowBlur = Math.max(1.2, H * 0.012);
  return (
    `<defs>` +
      `<linearGradient id="strip-bg" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0%" stop-color="${palette.bgTop}" />` +
        `<stop offset="100%" stop-color="${palette.bgBot}" />` +
      `</linearGradient>` +
      `<filter id="strip-hairline-glow" x="-2%" y="-800%" width="104%" height="1700%">` +
        `<feGaussianBlur stdDeviation="0 ${glowBlur.toFixed(2)}" />` +
      `</filter>` +
    `</defs>`
  );
}

function buildStripHairline(W: number, palette: StripPalette): string {
  // A 1.5px amber rule with a vertical-only Gaussian bloom underneath, so the
  // strip visually lifts away from the photograph above without adding any
  // chrome elsewhere in the layout.
  return (
    `<line x1="0" y1="0.5" x2="${W}" y2="0.5" stroke="${palette.hairline}" ` +
      `stroke-opacity="0.34" stroke-width="3" filter="url(#strip-hairline-glow)" />` +
    `<line x1="0" y1="0.5" x2="${W}" y2="0.5" stroke="${palette.hairline}" ` +
      `stroke-opacity="0.72" stroke-width="1.2" />`
  );
}

function buildStripAmbience(W: number, H: number, palette: StripPalette): string {
  // Deterministic sprinkle of micro-stars for texture. Seeded by dimensions so
  // re-exports of the same photo produce identical SVG.
  const rng = mulberry32(Math.round(W * 7919 + H * 31));
  const count = Math.max(6, Math.round(W / 240));
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = rng() * W;
    const y = H * 0.08 + rng() * H * 0.84;
    const r = 0.35 + rng() * 0.95;
    const opacity = 0.14 + rng() * 0.38;
    const color = rng() > 0.78 ? palette.accent : '#F1F2F7';
    parts.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" ` +
        `fill="${color}" opacity="${opacity.toFixed(2)}" />`,
    );
  }
  return parts.join('');
}

// Refined outline icons — all drawn inside a centered (0,0) frame so the
// caller positions them with a single translate. Stroked, not filled: keeps
// them visually lighter than the big serif numbers they sit above.
function statIconStar(r: number, color: string): string {
  const tip = r * 0.3;
  const sw = Math.max(1, r * 0.14);
  return (
    `<path d="M 0 ${-r} L ${tip} ${-tip} L ${r} 0 L ${tip} ${tip} L 0 ${r} ` +
    `L ${-tip} ${tip} L ${-r} 0 L ${-tip} ${-tip} Z" fill="none" ` +
    `stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-linejoin="round" />`
  );
}

function statIconConstellation(r: number, color: string): string {
  const sw = Math.max(0.9, r * 0.11);
  const dot = r * 0.18;
  const p1 = { x: -r * 0.88, y: -r * 0.2 };
  const p2 = { x: r * 0.82, y: -r * 0.5 };
  const p3 = { x: r * 0.05, y: r * 0.82 };
  return (
    `<g stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-opacity="0.55" stroke-linecap="round" fill="none">` +
      `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" />` +
      `<line x1="${p2.x}" y1="${p2.y}" x2="${p3.x}" y2="${p3.y}" />` +
      `<line x1="${p3.x}" y1="${p3.y}" x2="${p1.x}" y2="${p1.y}" />` +
    `</g>` +
    `<g fill="${color}">` +
      `<circle cx="${p1.x}" cy="${p1.y}" r="${dot.toFixed(2)}" />` +
      `<circle cx="${p2.x}" cy="${p2.y}" r="${dot.toFixed(2)}" />` +
      `<circle cx="${p3.x}" cy="${p3.y}" r="${dot.toFixed(2)}" />` +
    `</g>`
  );
}

function statIconDeepSky(r: number, color: string): string {
  // Tilted ellipse + solid core — reads as a spiral galaxy silhouette.
  const sw = Math.max(1, r * 0.13);
  const rx = r * 0.98;
  const ry = r * 0.42;
  const core = r * 0.2;
  return (
    `<g transform="rotate(-22)">` +
      `<ellipse cx="0" cy="0" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="none" ` +
        `stroke="${color}" stroke-width="${sw.toFixed(2)}" />` +
      `<circle cx="0" cy="0" r="${core.toFixed(2)}" fill="${color}" />` +
    `</g>`
  );
}

interface StripFontScale {
  wordmark: number;
  url: number;
  location: number;
  coords: number;
  statNumber: number;
}

// Mulberry32 — deterministic PRNG so decorative stars stay stable across
// identical-sized exports instead of reshuffling on every render.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function ensureFontsReady(): Promise<void> {
  const fonts = (document as Document & { fonts?: { ready: Promise<FontFaceSet> } }).fonts;
  if (fonts?.ready) {
    try { await fonts.ready; } catch { /* ignore */ }
  }
}

// --- SVG construction -------------------------------------------------------

function rgba(t: RgbaTuple, alphaScale = 1): string {
  const [r, g, b, a] = t;
  const alpha = Math.min(255, a * alphaScale);
  return `rgba(${r | 0},${g | 0},${b | 0},${(alpha / 255).toFixed(3)})`;
}

// Must stay in lockstep with OverlayCanvas — the export is meant to mirror
// what the live viewer paints. If you tune one, tune the other.
const LINE_ALPHA_BOOST = 0.95;
const LINE_WIDTH_BOOST = 1.1;
const LINE_WHITEN = 0.6;

function lineStroke(tuple: RgbaTuple): string {
  const [r, g, b, a] = tuple;
  const wr = r + (255 - r) * LINE_WHITEN;
  const wg = g + (255 - g) * LINE_WHITEN;
  const wb = b + (255 - b) * LINE_WHITEN;
  const alpha = Math.min(255, a * LINE_ALPHA_BOOST);
  return `rgba(${wr | 0},${wg | 0},${wb | 0},${(alpha / 255).toFixed(3)})`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type StripFontFamily = 'serif' | 'mono';

interface StripTextMetrics {
  fontSize: number;
  family: StripFontFamily;
  letterSpacingEm?: number;
}

function charAdvance(ch: string, family: StripFontFamily): number {
  if (!ch) return 0;
  if (/\s/u.test(ch)) return 0.34;
  if (/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/u.test(ch)) {
    return family === 'mono' ? 0.94 : 0.98;
  }
  if (/[\u0600-\u06FF]/u.test(ch)) return family === 'mono' ? 0.8 : 0.76;
  if (/[A-Z]/.test(ch)) return family === 'mono' ? 0.62 : 0.69;
  if (/[a-z]/.test(ch)) return family === 'mono' ? 0.62 : 0.56;
  if (/[0-9]/.test(ch)) return family === 'mono' ? 0.62 : 0.58;
  if (/[.,:;'"`!|]/.test(ch)) return 0.26;
  if (/[()[\]{}]/.test(ch)) return 0.36;
  if (/[-–—_]/.test(ch)) return 0.42;
  if (/[/\\]/.test(ch)) return 0.42;
  if (/[&@#%*+=~]/.test(ch)) return family === 'mono' ? 0.64 : 0.6;
  return family === 'mono' ? 0.62 : 0.58;
}

function estimateStripTextWidth(value: string, metrics: StripTextMetrics): number {
  const chars = Array.from(value);
  if (!chars.length) return 0;
  const base = chars.reduce((sum, ch) => sum + charAdvance(ch, metrics.family), 0) * metrics.fontSize;
  const spacing = Math.max(0, chars.length - 1) * metrics.fontSize * (metrics.letterSpacingEm ?? 0);
  return base + spacing;
}

function trimForEllipsis(value: string): string {
  return value.replace(/[\s,.;:|/_-]+$/u, '');
}

function truncateTextEnd(value: string, maxWidth: number, metrics: StripTextMetrics): string {
  const text = value.trim();
  if (!text || estimateStripTextWidth(text, metrics) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && estimateStripTextWidth(`${chars.join('')}…`, metrics) > maxWidth) {
    chars.pop();
  }
  return `${trimForEllipsis(chars.join(''))}…`;
}

function truncateTextMiddle(value: string, maxWidth: number, metrics: StripTextMetrics): string {
  const text = value.trim();
  if (!text || estimateStripTextWidth(text, metrics) <= maxWidth) return text;
  const chars = Array.from(text);
  let left = Math.ceil(chars.length / 2);
  let right = left;
  while (left > 1 && right < chars.length) {
    const candidate = `${chars.slice(0, left).join('')}…${chars.slice(right).join('')}`;
    if (estimateStripTextWidth(candidate, metrics) <= maxWidth) {
      return `${trimForEllipsis(chars.slice(0, left).join(''))}…${chars.slice(right).join('').trimStart()}`;
    }
    if (left - 1 > chars.length - right) {
      left -= 1;
    } else {
      right += 1;
    }
  }
  return truncateTextEnd(text, maxWidth, metrics);
}

function circlePath(x: number, y: number, r: number): string {
  return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
}

function deepSkyPath(m: OverlayDeepSkyMarker): string {
  const { x, y, radius: r } = m;
  switch (m.marker) {
    case 'triangle': {
      const h = r * 1.1547;
      return `M ${x} ${y - h} L ${x + r} ${y + h / 2} L ${x - r} ${y + h / 2} Z`;
    }
    case 'diamond':
      return `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`;
    case 'circle':
      return circlePath(x, y, r);
    case 'hexagon': {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        pts.push(`${x + Math.cos(a) * r} ${y + Math.sin(a) * r}`);
      }
      return `M ${pts.join(' L ')} Z`;
    }
    case 'ring': {
      const inner = r * 0.55;
      return `${circlePath(x, y, r)} ${circlePath(x, y, inner)}`;
    }
    case 'x_circle': {
      const c = r * Math.SQRT1_2;
      return (
        `${circlePath(x, y, r)} ` +
        `M ${x - c} ${y - c} L ${x + c} ${y + c} ` +
        `M ${x + c} ${y - c} L ${x - c} ${y + c}`
      );
    }
    case 'square':
    default:
      return `M ${x - r} ${y - r} L ${x + r} ${y - r} L ${x + r} ${y + r} L ${x - r} ${y + r} Z`;
  }
}

function renderLine(s: OverlayLineSegment): string {
  return (
    `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ` +
    `stroke="${lineStroke(s.rgba)}" stroke-width="${(s.line_width * LINE_WIDTH_BOOST).toFixed(2)}" stroke-linecap="round" />`
  );
}

function renderLeaders(items: OverlayTextItem[]): string {
  return items
    .filter((t): t is OverlayTextItem & { leader: OverlayLineSegment } => !!t.leader)
    .map((t) => renderLine(t.leader))
    .join('');
}

/**
 * Star marker export: outlined halo + inner ring — a still-frame of what the live
 * overlay paints. Never covers the photographed star point underneath.
 */
function renderStar(m: OverlayStarMarker): string {
  const ringR = m.radius + 2.6;
  const haloR = m.radius + 5.2;
  return (
    `<circle cx="${m.x}" cy="${m.y}" r="${haloR}" fill="none" ` +
    `stroke="${rgba(m.fill_rgba)}" stroke-opacity="0.7" stroke-width="1.6" />` +
    `<circle cx="${m.x}" cy="${m.y}" r="${ringR}" fill="none" ` +
    `stroke="${rgba(m.outline_rgba)}" stroke-width="1.8" />`
  );
}

function renderDsoMarker(m: OverlayDeepSkyMarker): string {
  return (
    `<path d="${deepSkyPath(m)}" fill="none" stroke="${rgba(m.rgba)}" ` +
    `stroke-width="${m.line_width}" stroke-linejoin="round" />`
  );
}

const LABEL_FONT_SANS = `ui-sans-serif, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans', 'Microsoft YaHei', sans-serif`;
const LABEL_FONT_SERIF = `'Spectral','Noto Serif SC','Iowan Old Style',Georgia,'Songti SC',serif`;
const LABEL_FONT_MONO = `'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace`;

function labelFontFamily(family: OverlayTextItem['font_family']): string {
  switch (family) {
    case 'serif':
      return LABEL_FONT_SERIF;
    case 'mono':
      return LABEL_FONT_MONO;
    case 'sans':
    default:
      return LABEL_FONT_SANS;
  }
}

function estimateLabelWidth(t: OverlayTextItem): number {
  if (t.text_width != null) return t.text_width;
  const wideMul =
    t.font_family === 'serif' ? 1.04 : t.font_family === 'mono' ? 1.08 : 1.0;
  const italicMul = t.italic ? 1.03 : 1.0;
  const letterSpacingEm = t.letter_spacing ?? 0;
  let advance = 0;
  let count = 0;
  for (const ch of t.text) {
    count += 1;
    const code = ch.codePointAt(0) ?? 0;
    advance += code >= 0x2e80 ? 1.0 : 0.58;
  }
  return (
    (advance * wideMul * italicMul + Math.max(0, count - 1) * letterSpacingEm) * t.font_size
  );
}

function renderLabel(t: OverlayTextItem): string {
  const family = labelFontFamily(t.font_family);
  const weight = t.font_weight ?? 600;
  const fontStyle = t.italic ? ' font-style="italic"' : '';
  const letterSpacing =
    t.letter_spacing ? ` letter-spacing="${t.letter_spacing}em"` : '';

  let chip = '';
  if (t.chip) {
    const w = estimateLabelWidth(t);
    const ascent = t.font_size * 0.82;
    const descent = t.font_size * 0.24;
    const rx = t.chip.radius;
    const x = t.x - t.chip.padding_x;
    const y = t.y - ascent - t.chip.padding_y;
    const width = w + t.chip.padding_x * 2;
    const height = ascent + descent + t.chip.padding_y * 2;
    const strokeAttr = t.chip.border_rgba
      ? ` stroke="${rgba(t.chip.border_rgba)}" stroke-width="${t.chip.border_width ?? 1}"`
      : '';
    chip =
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" ` +
      `rx="${rx}" ry="${rx}" fill="${rgba(t.chip.fill_rgba)}"${strokeAttr} />`;
  }

  const text =
    `<text x="${t.x}" y="${t.y}" font-size="${t.font_size}" font-weight="${weight}"${fontStyle} ` +
    `font-family="${family}"${letterSpacing} fill="${rgba(t.text_rgba)}" ` +
    `stroke="${rgba(t.stroke_rgba)}" stroke-width="${t.stroke_width}" ` +
    `paint-order="stroke fill" text-anchor="start" dominant-baseline="alphabetic">` +
    `${esc(t.text)}</text>`;

  return chip + text;
}

function buildOverlaySvg(scene: OverlayScene, layers: OverlayOptions['layers']): string {
  const { image_width: W, image_height: H } = scene;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  );
  parts.push(
    `<defs>` +
      `<clipPath id="overlay-clip"><rect x="0" y="0" width="${W}" height="${H}" /></clipPath>` +
      // Match the live overlay's filters so the exported image carries the same bloom.
      `<filter id="overlay-line-glow" x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox">` +
      `<feGaussianBlur stdDeviation="2.6" result="blurWide" />` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="0.9" result="blurTight" />` +
      `<feMerge><feMergeNode in="blurWide" /><feMergeNode in="blurWide" /><feMergeNode in="blurTight" /><feMergeNode in="SourceGraphic" /></feMerge>` +
      `</filter>` +
      `<filter id="overlay-star-glow" x="-30%" y="-30%" width="160%" height="160%" filterUnits="objectBoundingBox">` +
      `<feGaussianBlur stdDeviation="2" result="blur" />` +
      `<feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>` +
      `</filter>` +
      `</defs>`,
  );
  parts.push(`<g clip-path="url(#overlay-clip)">`);

  if (layers.constellation_lines) {
    parts.push(`<g filter="url(#overlay-line-glow)">`);
    for (const figure of scene.constellation_figures) {
      for (const s of figure.segments) parts.push(renderLine(s));
    }
    parts.push(`</g>`);
  }
  const showStarLabels = layers.star_markers && layers.star_labels;
  const showDsoLabels = layers.deep_sky_markers && layers.deep_sky_labels;
  if (layers.label_leaders) {
    if (showStarLabels) parts.push(renderLeaders(scene.star_labels));
    if (showDsoLabels) parts.push(renderLeaders(scene.deep_sky_labels));
  }
  if (layers.deep_sky_markers) {
    for (const m of scene.deep_sky_markers) parts.push(renderDsoMarker(m));
  }
  if (layers.star_markers) {
    parts.push(`<g filter="url(#overlay-star-glow)">`);
    for (const m of scene.star_markers) parts.push(renderStar(m));
    parts.push(`</g>`);
  }
  if (layers.constellation_labels) {
    for (const t of scene.constellation_labels) parts.push(renderLabel(t));
  }
  if (showStarLabels) {
    for (const t of scene.star_labels) parts.push(renderLabel(t));
  }
  if (showDsoLabels) {
    for (const t of scene.deep_sky_labels) parts.push(renderLabel(t));
  }

  parts.push(`</g></svg>`);
  return parts.join('');
}

// --- helpers ----------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function svgToObjectUrl(markup: string): string {
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  return URL.createObjectURL(blob);
}
