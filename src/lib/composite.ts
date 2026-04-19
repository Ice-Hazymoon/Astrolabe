import type {
  OverlayDeepSkyMarker,
  OverlayLineSegment,
  OverlayOptions,
  OverlayScene,
  OverlayStarMarker,
  OverlayTextItem,
  RgbaTuple,
} from '@/types/api';
import { logoSvgMarkup } from '@/lib/logoMarkup';

/**
 * Rasterize the original image + the current overlay scene into a single PNG blob URL.
 * Canvas is sized to the scene's native dimensions (which match the uploaded image),
 * so the exported PNG preserves the user's original resolution and aspect ratio —
 * only the overlay layer is added.
 */
export async function composeAnnotated(
  imageSrc: string,
  scene: OverlayScene,
  layers: OverlayOptions['layers'],
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

  const markup = buildOverlaySvg({ ...scene, image_width: width, image_height: height }, layers);
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
 * Rasterize the annotated image AND a white attribution strip at the bottom
 * (location name, coordinates, site logo + wordmark + URL) as a single PNG
 * blob URL. This is the "share-ready" export used by the save dialog.
 */
export async function composeAnnotatedWithStrip(
  imageSrc: string,
  scene: OverlayScene,
  layers: OverlayOptions['layers'],
  meta: StripMeta,
): Promise<string> {
  const img = await loadImage(imageSrc);
  const W = scene.image_width > 0 ? scene.image_width : img.naturalWidth;
  const H = scene.image_height > 0 ? scene.image_height : img.naturalHeight;
  if (!W || !H) throw new Error('missing image dimensions');

  const stripH = stripHeightFor(W);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H + stripH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  // Photo
  ctx.drawImage(img, 0, 0, W, H);

  // Overlay layer (same SVG the live viewer paints)
  const overlay = buildOverlaySvg({ ...scene, image_width: W, image_height: H }, layers);
  const overlayUrl = svgToObjectUrl(overlay);
  try {
    const overlayImg = await loadImage(overlayUrl);
    ctx.drawImage(overlayImg, 0, 0, W, H);
  } finally {
    URL.revokeObjectURL(overlayUrl);
  }

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
  return Math.round(Math.max(150, Math.min(imageWidth * 0.095, 300)));
}

export function buildStripSvg(W: number, H: number, meta: StripMeta): string {
  // Geometry — padding scales with both axes so wide panoramas don't look
  // cramped against their edges and tall thumbnails don't waste the middle.
  const padX = Math.round(Math.max(H * 0.35, W * 0.035));
  const logoSize = Math.round(H * 0.36);
  const logoX = padX;
  const logoY = Math.round(H / 2 - logoSize / 2);
  const logoScale = logoSize / 32;
  const leftBlockX = logoX + logoSize + Math.round(H * 0.28);
  const rightBlockX = W - padX;

  // Equal-width three-column band: [padX, gutterL], [gutterL, gutterR],
  // [gutterR, W - padX] — each exactly (W - 2·padX) / 3 wide.
  const gutterL = Math.round((W + padX) / 3);
  const gutterR = Math.round((2 * W - padX) / 3);

  // Typography — expressed as ratios of the strip height so every field scales
  // together when the strip grows or shrinks with the photo size.
  const fs = {
    eyebrow: Math.round(H * 0.075),
    name: Math.round(H * 0.2),
    nameSolo: Math.round(H * 0.26),
    coords: Math.round(H * 0.1),
    coordsSolo: Math.round(H * 0.17),
    statNumber: Math.round(H * 0.24),
    statLabel: Math.round(H * 0.072),
    wordmark: Math.round(H * 0.18),
    url: Math.round(H * 0.095),
  };

  const serif = `'Spectral','Noto Serif SC','Iowan Old Style',Georgia,serif`;
  const mono = `'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace`;

  // Palette — warm cream ground + ink on paper + one muted gold accent.
  const palette = {
    ink: '#15161B',
    inkMid: '#55565D',
    inkSoft: '#8A8B92',
    accent: '#B18A3C',
    accentSoft: '#D9C188',
    bgTop: '#FDFBF6',
    bgBot: '#F3EEE0',
  };

  const locationName = meta.locationName.trim();
  const coordinates = meta.coordinates.trim();
  const siteName = (meta.siteName || 'Stellaris').trim();
  const siteUrl = (meta.siteUrl || '').toLowerCase();
  const geom: StripGeom = { H, fs, serif, mono, palette };

  const left = buildLeft(locationName, coordinates, { ...geom, leftBlockX });
  const stats = meta.stats ? buildStats(meta.stats, gutterL, gutterR, geom) : '';
  const right = buildRight(siteName, siteUrl, { ...geom, rightBlockX });
  const rule = stats ? buildCenterRule(gutterL, gutterR, H, palette) : '';
  const logo = logoSvgMarkup(palette.ink);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<defs>` +
        `<linearGradient id="strip-bg" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0%" stop-color="${palette.bgTop}" />` +
          `<stop offset="100%" stop-color="${palette.bgBot}" />` +
        `</linearGradient>` +
      `</defs>` +
      `<rect width="${W}" height="${H}" fill="url(#strip-bg)" />` +
      `<g transform="translate(${logoX} ${logoY}) scale(${logoScale})">${logo}</g>` +
      left +
      rule +
      stats +
      right +
    `</svg>`
  );
}

function buildCenterRule(
  gutterL: number,
  gutterR: number,
  H: number,
  palette: StripGeom['palette'],
): string {
  // Two ultra-fine vertical hairlines book-ending the stats column. They sit
  // exactly on the equal-thirds boundaries so the middle section feels like a
  // gated insert between left and right.
  const topY = Math.round(H * 0.22);
  const bottomY = Math.round(H * 0.78);
  const common = `stroke="${palette.accent}" stroke-opacity="0.3" stroke-width="1"`;
  return (
    `<line x1="${gutterL}" y1="${topY}" x2="${gutterL}" y2="${bottomY}" ${common} />` +
    `<line x1="${gutterR}" y1="${topY}" x2="${gutterR}" y2="${bottomY}" ${common} />`
  );
}

function buildStats(
  stats: NonNullable<StripMeta['stats']>,
  gutterL: number,
  gutterR: number,
  g: StripGeom,
): string {
  const { H, fs, serif, mono, palette } = g;
  const span = gutterR - gutterL;
  const columns = [
    {
      x: gutterL + span * 0.18,
      value: stats.stars,
      label: stats.labels?.stars ?? 'STARS',
    },
    {
      x: gutterL + span * 0.5,
      value: stats.constellations,
      label: stats.labels?.constellations ?? 'CONSTEL.',
    },
    {
      x: gutterL + span * 0.82,
      value: stats.deepSky,
      label: stats.labels?.deepSky ?? 'DEEP SKY',
    },
  ];
  const iconCy = Math.round(H * 0.3);
  const iconR = H * 0.07;
  const numY = Math.round(H * 0.62);
  const labY = Math.round(H * 0.83);
  const glyphs = [
    statGlyphStar,
    statGlyphConstellation,
    statGlyphDeepSky,
  ] as const;

  return columns
    .map((col, i) => {
      const glyph = glyphs[i](iconR, iconCy, palette.accent);
      return (
        `<g transform="translate(${Math.round(col.x)} 0)">` +
          glyph +
          `<text x="0" y="${numY}" text-anchor="middle" font-family="${serif}" ` +
          `font-size="${fs.statNumber}" font-weight="500" fill="${palette.ink}" ` +
          `letter-spacing="-0.01em">${col.value}</text>` +
          `<text x="0" y="${labY}" text-anchor="middle" font-family="${mono}" ` +
          `font-size="${fs.statLabel}" font-weight="500" fill="${palette.inkSoft}" ` +
          `letter-spacing="0.24em">${col.label}</text>` +
        `</g>`
      );
    })
    .join('');
}

function statGlyphStar(r: number, cy: number, color: string): string {
  const tip = r * 0.32;
  return (
    `<path transform="translate(0 ${cy})" fill="${color}" d="` +
    `M 0 ${-r} L ${tip} ${-tip} L ${r} 0 L ${tip} ${tip} L 0 ${r} ` +
    `L ${-tip} ${tip} L ${-r} 0 L ${-tip} ${-tip} Z" />`
  );
}

function statGlyphConstellation(r: number, cy: number, color: string): string {
  // Three filled dots in a loose triangle, connected with faint lines.
  const p1x = -r * 0.95, p1y = -r * 0.35;
  const p2x = r * 0.95, p2y = -r * 0.2;
  const p3x = -r * 0.15, p3y = r * 0.85;
  const dot = r * 0.26;
  const stroke = Math.max(1, r * 0.1);
  return (
    `<g transform="translate(0 ${cy})">` +
      `<g stroke="${color}" stroke-width="${stroke}" stroke-opacity="0.55" stroke-linecap="round">` +
        `<line x1="${p1x}" y1="${p1y}" x2="${p2x}" y2="${p2y}" />` +
        `<line x1="${p2x}" y1="${p2y}" x2="${p3x}" y2="${p3y}" />` +
        `<line x1="${p3x}" y1="${p3y}" x2="${p1x}" y2="${p1y}" />` +
      `</g>` +
      `<g fill="${color}">` +
        `<circle cx="${p1x}" cy="${p1y}" r="${dot}" />` +
        `<circle cx="${p2x}" cy="${p2y}" r="${dot}" />` +
        `<circle cx="${p3x}" cy="${p3y}" r="${dot}" />` +
      `</g>` +
    `</g>`
  );
}

function statGlyphDeepSky(r: number, cy: number, color: string): string {
  // Hollow ring + filled core — a generic galaxy/nebula mark.
  const ringStroke = Math.max(1, r * 0.17);
  return (
    `<g transform="translate(0 ${cy})">` +
      `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${color}" stroke-width="${ringStroke}" />` +
      `<circle cx="0" cy="0" r="${r * 0.28}" fill="${color}" />` +
    `</g>`
  );
}

/**
 * Canvas drawImage on an SVG that references web fonts can rasterize before
 * the font is ready, producing a fallback-font snapshot. Awaiting the font
 * set before composition avoids that race.
 */
interface StripGeom {
  H: number;
  fs: {
    eyebrow: number;
    name: number;
    nameSolo: number;
    coords: number;
    coordsSolo: number;
    statNumber: number;
    statLabel: number;
    wordmark: number;
    url: number;
  };
  serif: string;
  mono: string;
  palette: {
    ink: string;
    inkMid: string;
    inkSoft: string;
    accent: string;
    accentSoft: string;
    bgTop: string;
    bgBot: string;
  };
}

function buildLeft(
  locationName: string,
  coordinates: string,
  g: StripGeom & { leftBlockX: number },
): string {
  const { leftBlockX, H, fs, serif, mono, palette } = g;
  const eyebrowAttrs =
    `font-family="${serif}" font-size="${fs.eyebrow}" font-weight="500" ` +
    `fill="${palette.accent}" letter-spacing="0.34em"`;
  const nameAttrs =
    `font-family="${serif}" fill="${palette.ink}" font-weight="500" letter-spacing="-0.005em"`;
  const coordsAttrs =
    `font-family="${mono}" fill="${palette.inkMid}" font-weight="500" letter-spacing="0.05em"`;

  if (locationName && coordinates) {
    const eyebrowY = Math.round(H * 0.3);
    const nameY = Math.round(H * 0.58);
    const coordsY = Math.round(H * 0.83);
    return (
      `<text x="${leftBlockX}" y="${eyebrowY}" ${eyebrowAttrs}>OBSERVED FROM</text>` +
      `<text x="${leftBlockX}" y="${nameY}" font-size="${fs.name}" ${nameAttrs}>${esc(locationName)}</text>` +
      `<text x="${leftBlockX}" y="${coordsY}" font-size="${fs.coords}" ${coordsAttrs}>${esc(coordinates)}</text>`
    );
  }
  if (locationName) {
    const eyebrowY = Math.round(H * 0.34);
    const y = Math.round(H * 0.72);
    return (
      `<text x="${leftBlockX}" y="${eyebrowY}" ${eyebrowAttrs}>OBSERVED FROM</text>` +
      `<text x="${leftBlockX}" y="${y}" font-size="${fs.nameSolo}" ${nameAttrs}>${esc(locationName)}</text>`
    );
  }
  if (coordinates) {
    const eyebrowY = Math.round(H * 0.34);
    const y = Math.round(H * 0.72);
    return (
      `<text x="${leftBlockX}" y="${eyebrowY}" ${eyebrowAttrs}>COORDINATES</text>` +
      `<text x="${leftBlockX}" y="${y}" font-size="${fs.coordsSolo}" ${coordsAttrs}>${esc(coordinates)}</text>`
    );
  }
  return '';
}

function buildRight(
  siteName: string,
  siteUrl: string,
  g: StripGeom & { rightBlockX: number },
): string {
  const { rightBlockX, H, fs, serif, mono, palette } = g;
  // Wordmark top, short gold accent rule, URL bottom — three layers with
  // generous breathing room. The accent rule both anchors the eye and gives
  // the signature side a subtle editorial feel.
  const wordmarkY = Math.round(H * 0.46);
  const ruleY = Math.round(H * 0.56);
  const urlY = Math.round(siteUrl ? H * 0.82 : ruleY);
  const ruleLen = Math.round(H * 0.58);

  const wordmark =
    `<text x="${rightBlockX}" y="${wordmarkY}" text-anchor="end" font-family="${serif}" ` +
    `font-size="${fs.wordmark}" font-weight="500" fill="${palette.ink}" ` +
    `letter-spacing="0.02em">${esc(siteName)}</text>`;

  const accent =
    `<line x1="${rightBlockX - ruleLen}" y1="${ruleY}" x2="${rightBlockX}" y2="${ruleY}" ` +
    `stroke="${palette.accent}" stroke-width="1.2" opacity="0.78" />`;

  const url = siteUrl
    ? `<text x="${rightBlockX}" y="${urlY}" text-anchor="end" font-family="${mono}" ` +
      `font-size="${fs.url}" font-weight="500" fill="${palette.inkSoft}" ` +
      `letter-spacing="0.16em">${esc(siteUrl)}</text>`
    : '';

  return wordmark + accent + url;
}

async function ensureFontsReady(): Promise<void> {
  const fonts = (document as Document & { fonts?: { ready: Promise<FontFaceSet> } }).fonts;
  if (fonts?.ready) {
    try { await fonts.ready; } catch { /* ignore */ }
  }
}

// --- SVG construction -------------------------------------------------------

function rgba(t: RgbaTuple): string {
  const [r, g, b, a] = t;
  return `rgba(${r | 0},${g | 0},${b | 0},${(a / 255).toFixed(3)})`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
    `stroke="${rgba(s.rgba)}" stroke-width="${s.line_width}" stroke-linecap="round" />`
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
    `stroke="${rgba(m.fill_rgba)}" stroke-opacity="0.45" stroke-width="1.2" />` +
    `<circle cx="${m.x}" cy="${m.y}" r="${ringR}" fill="none" ` +
    `stroke="${rgba(m.outline_rgba)}" stroke-width="1.4" />`
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
      `<filter id="overlay-line-glow" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox">` +
      `<feGaussianBlur stdDeviation="2.2" result="blur" />` +
      `<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>` +
      `</filter>` +
      `<filter id="overlay-star-glow" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox">` +
      `<feGaussianBlur stdDeviation="1.4" result="blur" />` +
      `<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>` +
      `</filter>` +
      `</defs>`,
  );
  parts.push(`<g clip-path="url(#overlay-clip)">`);

  if (layers.constellation_lines) {
    parts.push(`<g filter="url(#overlay-line-glow)">`);
    for (const s of scene.constellation_lines) parts.push(renderLine(s));
    parts.push(`</g>`);
  }
  const showDsoLabels = layers.deep_sky_markers && layers.deep_sky_labels;
  if (layers.label_leaders) {
    if (layers.star_labels) parts.push(renderLeaders(scene.star_labels));
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
  if (layers.star_labels) {
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
