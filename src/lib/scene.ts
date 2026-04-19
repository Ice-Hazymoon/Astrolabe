import type {
  Catalog,
  CatalogConstellation,
  CatalogDso,
  CatalogStar,
  DeepSkyMarkerShape,
  LabelChip,
  LabelFontFamily,
  LabelVariant,
  OverlayDeepSkyMarker,
  OverlayLineSegment,
  OverlayOptions,
  OverlayScene,
  OverlayStarMarker,
  OverlayTextItem,
  RgbaTuple,
} from '@/types/api';

const LINE_RGBA: RgbaTuple = [212, 222, 236, 135];

// --- Label palette ---------------------------------------------------------
// Each variant gets a distinct tint, weight, and stroke recipe so the eye can
// tell constellation names from stars from DSOs at a glance.
const CONST_LABEL_RGBA: RgbaTuple = [248, 230, 168, 255]; // warm gold
const CONST_STROKE_RGBA: RgbaTuple = [18, 10, 0, 235];

const STAR_OUTLINE_RGBA: RgbaTuple = [255, 255, 255, 210];
const STAR_LABEL_RGBA: RgbaTuple = [250, 244, 228, 255]; // soft cream
const STAR_STROKE_RGBA: RgbaTuple = [0, 0, 0, 225];

const DSO_LABEL_RGBA: RgbaTuple = [178, 232, 255, 255]; // cool cyan
const DSO_STROKE_RGBA: RgbaTuple = [2, 8, 20, 225];
const DSO_CHIP_FILL: RgbaTuple = [4, 10, 22, 120];
const DSO_CHIP_BORDER: RgbaTuple = [120, 200, 240, 110];

const LEADER_RGBA: RgbaTuple = [220, 230, 246, 165];

/**
 * Map a star's apparent magnitude to a marker radius. Brighter stars (lower magnitude)
 * are drawn larger, roughly following a Pogson-ish curve so that mag-0 stars feel like
 * anchors while mag-5 ones stay recognizable but quiet.
 */
function starRadius(magnitude: number): number {
  const r = 5.4 - 0.55 * magnitude;
  return Math.max(2.2, Math.min(6.2, r));
}

function starFill(magnitude: number): RgbaTuple {
  // Brighter stars tilt warm/cream; dim stars fade toward cool white.
  const t = Math.max(0, Math.min(1, (magnitude + 1) / 6));
  const r = Math.round(255 - 10 * t);
  const g = Math.round(226 - 20 * t);
  const b = Math.round(170 + 40 * t);
  return [r, g, b, 215];
}

function dsoMarkerShape(typeCode: string): DeepSkyMarkerShape {
  const code = typeCode.toLowerCase();
  if (code.includes('pn')) return 'ring';
  if (code.includes('snr') || code === 'sr') return 'x_circle';
  if (code.includes('g') && !code.includes('gc') && !code.includes('glob')) {
    // plain galaxy codes (G, Gal, etc.)
    if (code === 'g' || code === 'gal' || code === 'galaxy') return 'x_circle';
  }
  if (code.includes('gc') || code.includes('glob')) return 'circle';
  if (
    code.includes('neb') ||
    code === 'n' ||
    code.includes('rfn') ||
    code.includes('rn') ||
    code.includes('en') ||
    code.includes('dn') ||
    code.includes('hii') ||
    code.includes('cl+n')
  ) {
    return 'hexagon';
  }
  if (code.includes('ast')) return 'triangle';
  return 'square'; // open clusters and unknowns
}

function dsoStroke(typeCode: string): RgbaTuple {
  const shape = dsoMarkerShape(typeCode);
  switch (shape) {
    case 'ring':
      return [180, 220, 255, 230];
    case 'x_circle':
      return [255, 200, 200, 230];
    case 'hexagon':
      return [200, 230, 255, 235];
    case 'circle':
      return [200, 255, 220, 230];
    case 'triangle':
      return [230, 220, 180, 230];
    case 'square':
    default:
      return [145, 228, 255, 235];
  }
}

function sortStarsForLabeling(stars: CatalogStar[]): CatalogStar[] {
  return [...stars].sort((a, b) => a.magnitude - b.magnitude);
}

function sortDsosForLabeling(dsos: CatalogDso[]): CatalogDso[] {
  return [...dsos].sort((a, b) => {
    if (!!a.curated !== !!b.curated) return a.curated ? -1 : 1;
    return a.magnitude - b.magnitude;
  });
}

// --- Text metrics ----------------------------------------------------------

/**
 * Rough text-width estimate. Distinguishes wide glyphs (CJK + general unicode ≥ U+2E80)
 * from narrow ones so we can layout without a DOM measurement pass. Italic and serif
 * families are slightly wider per-glyph; letter-spacing adds a flat offset per advance.
 */
function estimateTextWidth(
  text: string,
  fontSize: number,
  opts: {
    italic?: boolean;
    family?: LabelFontFamily;
    letterSpacingEm?: number;
  } = {},
): number {
  const { italic = false, family = 'sans', letterSpacingEm = 0 } = opts;
  const wideMul = family === 'serif' ? 1.04 : family === 'mono' ? 1.08 : 1.0;
  const italicMul = italic ? 1.03 : 1.0;
  let advance = 0;
  let count = 0;
  for (const ch of text) {
    count += 1;
    const code = ch.codePointAt(0) ?? 0;
    advance += code >= 0x2e80 ? 1.0 : 0.58;
  }
  return (advance * wideMul * italicMul + Math.max(0, count - 1) * letterSpacingEm) * fontSize;
}

// --- Layout engine ---------------------------------------------------------

interface LabelBox {
  x: number; // left
  y: number; // top
  w: number;
  h: number;
}

function boxesOverlap(a: LabelBox, b: LabelBox, pad: number): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

interface LabelSpec {
  text: string;
  variant: LabelVariant;
  /** Higher placed first. */
  priority: number;
  /** Anchor used for candidate generation — usually the marker center. */
  anchorX: number;
  anchorY: number;
  /** Radius of the marker at the anchor (0 for constellation labels). */
  anchorRadius: number;
  font_size: number;
  font_weight: number;
  font_family: LabelFontFamily;
  italic: boolean;
  letter_spacing: number;
  stroke_width: number;
  text_rgba: RgbaTuple;
  stroke_rgba: RgbaTuple;
  chip: LabelChip | null;
  /** True for constellation labels — they should be placed on their anchor, no leader. */
  centerAnchored: boolean;
}

interface PlacedLabel {
  item: OverlayTextItem;
  box: LabelBox;
}

/** Pre-baked candidate offset table: (angle degrees, rings of outward distance). */
const ANGLE_ORDER = [
  -20, // slight up-right
  20, // slight down-right
  -55,
  55,
  -90, // straight up
  90, // straight down
  -140,
  140,
  180, // straight left
  0, // straight right (last — least informative next to marker line)
];
const RING_MULTIPLIERS = [1, 1.5, 2.15, 3.1, 4.4];

/**
 * Build candidate baseline-start (x, y) positions around a marker.
 * Positions are ordered preferred-first: upper-right first, then alternating
 * directions, then progressively farther rings (which pair with leader lines).
 */
function candidatePositions(
  spec: LabelSpec,
  textW: number,
  ascent: number,
  descent: number,
): Array<{ x: number; y: number; ring: number; cx: number; cy: number }> {
  const out: Array<{ x: number; y: number; ring: number; cx: number; cy: number }> = [];
  const gap = spec.anchorRadius + 7;
  const halfW = textW / 2;
  const halfH = (ascent + descent) / 2;

  if (spec.centerAnchored) {
    // Place centered on the anchor first; then small pseudo-rings of drift to
    // escape collisions. No leader line for constellation labels.
    const drifts: Array<[number, number]> = [
      [0, 0],
      [0, -ascent * 0.75],
      [0, ascent * 0.75],
      [-textW * 0.4, 0],
      [textW * 0.4, 0],
      [-textW * 0.5, -ascent * 0.9],
      [textW * 0.5, -ascent * 0.9],
      [-textW * 0.5, ascent * 0.9],
      [textW * 0.5, ascent * 0.9],
    ];
    drifts.forEach(([dx, dy], i) => {
      const cx = spec.anchorX + dx;
      const cy = spec.anchorY + dy;
      out.push({
        x: cx - halfW,
        y: cy + ascent / 2 - descent / 2,
        cx,
        cy,
        ring: i === 0 ? 0 : 1,
      });
    });
    return out;
  }

  for (let r = 0; r < RING_MULTIPLIERS.length; r += 1) {
    const dist = gap * RING_MULTIPLIERS[r];
    for (const ang of ANGLE_ORDER) {
      const rad = (ang * Math.PI) / 180;
      // bbox center displaced by (dist + half-diagonal projection) so the
      // marker sits outside the label rectangle rather than behind its edge.
      const ex = Math.abs(Math.cos(rad)) * halfW + Math.abs(Math.sin(rad)) * halfH;
      const reach = dist + ex + 2;
      const cx = spec.anchorX + Math.cos(rad) * reach;
      const cy = spec.anchorY + Math.sin(rad) * reach;
      out.push({
        x: cx - halfW,
        y: cy + ascent / 2 - descent / 2,
        cx,
        cy,
        ring: r,
      });
    }
  }
  return out;
}

/**
 * Layout engine: places labels in priority order, skipping or routing each
 * one to a non-overlapping slot. Items that never fit are dropped. Items
 * placed beyond the first ring (or on the second+ drift for constellations)
 * receive a leader line back to the marker.
 */
function layoutLabels(
  specs: LabelSpec[],
  imageWidth: number,
  imageHeight: number,
): OverlayTextItem[] {
  const placed: PlacedLabel[] = [];
  const margin = 6;
  const pad = 4; // gap between label bboxes

  const ordered = [...specs].sort((a, b) => b.priority - a.priority);

  for (const spec of ordered) {
    const textW = estimateTextWidth(spec.text, spec.font_size, {
      italic: spec.italic,
      family: spec.font_family,
      letterSpacingEm: spec.letter_spacing,
    });
    const ascent = spec.font_size * 0.82;
    const descent = spec.font_size * 0.24;
    const boxW = textW + (spec.chip ? spec.chip.padding_x * 2 : 2);
    const boxH = ascent + descent + (spec.chip ? spec.chip.padding_y * 2 : 2);

    const candidates = candidatePositions(spec, textW, ascent, descent);

    let picked: { x: number; y: number; ring: number; cx: number; cy: number } | null = null;
    for (const c of candidates) {
      // Convert baseline x/y back to bounding box (left, top) for collision.
      const boxX = c.x - (spec.chip ? spec.chip.padding_x : 1);
      const boxY = c.y - ascent - (spec.chip ? spec.chip.padding_y : 1);
      // In-bounds check (label must stay fully visible, with small margin).
      if (boxX < margin || boxX + boxW > imageWidth - margin) continue;
      if (boxY < margin || boxY + boxH > imageHeight - margin) continue;

      const box: LabelBox = { x: boxX, y: boxY, w: boxW, h: boxH };
      if (placed.some((p) => boxesOverlap(p.box, box, pad))) continue;

      picked = c;
      break;
    }

    if (!picked) continue; // couldn't fit — drop the label

    // Add leader when the label sits far from its marker AND there is meaningful
    // distance between them (avoids a useless stub on the constellation path).
    const leader: OverlayLineSegment | null =
      !spec.centerAnchored && picked.ring > 0
        ? buildLeader(spec, picked.cx, picked.cy)
        : null;

    const boxX = picked.x - (spec.chip ? spec.chip.padding_x : 1);
    const boxY = picked.y - ascent - (spec.chip ? spec.chip.padding_y : 1);
    const box: LabelBox = { x: boxX, y: boxY, w: boxW, h: boxH };

    const item: OverlayTextItem = {
      text: spec.text,
      x: picked.x,
      y: picked.y,
      font_size: spec.font_size,
      stroke_width: spec.stroke_width,
      text_rgba: spec.text_rgba,
      stroke_rgba: spec.stroke_rgba,
      leader,
      variant: spec.variant,
      font_weight: spec.font_weight,
      font_family: spec.font_family,
      italic: spec.italic,
      letter_spacing: spec.letter_spacing,
      text_width: textW,
      chip: spec.chip,
    };
    placed.push({ item, box });
  }

  return placed.map((p) => p.item);
}

/**
 * Trim a leader line so it stops a few pixels shy of both endpoints —
 * visually separates the line from the marker edge and the label baseline.
 */
function buildLeader(spec: LabelSpec, labelCx: number, labelCy: number): OverlayLineSegment {
  const dx = labelCx - spec.anchorX;
  const dy = labelCy - spec.anchorY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const startShrink = spec.anchorRadius + 4;
  const endShrink = spec.font_size * 0.55;
  return {
    x1: spec.anchorX + ux * startShrink,
    y1: spec.anchorY + uy * startShrink,
    x2: labelCx - ux * endShrink,
    y2: labelCy - uy * endShrink,
    line_width: 0.9,
    rgba: LEADER_RGBA,
  };
}

// --- Spec builders ---------------------------------------------------------

function buildConstellationSpec(c: CatalogConstellation): LabelSpec {
  return {
    text: c.display_name,
    variant: 'constellation',
    priority: 300, // always win — big type sets the grid
    anchorX: c.label_x,
    anchorY: c.label_y,
    anchorRadius: 0,
    font_size: 28,
    font_weight: 600,
    font_family: 'serif',
    italic: false,
    letter_spacing: 0.14,
    stroke_width: 3.4,
    text_rgba: CONST_LABEL_RGBA,
    stroke_rgba: CONST_STROKE_RGBA,
    chip: null,
    centerAnchored: true,
  };
}

function buildStarSpec(s: CatalogStar): LabelSpec {
  const radius = starRadius(s.magnitude);
  // Bright stars get slightly bigger labels and higher priority.
  const fontSize = s.magnitude <= 1 ? 18 : s.magnitude <= 2.5 ? 17 : 16;
  return {
    text: s.name,
    variant: 'star',
    priority: 200 - s.magnitude * 10,
    anchorX: s.x,
    anchorY: s.y,
    anchorRadius: radius + 2,
    font_size: fontSize,
    font_weight: 500,
    font_family: 'sans',
    italic: false,
    letter_spacing: 0.02,
    stroke_width: 2.2,
    text_rgba: STAR_LABEL_RGBA,
    stroke_rgba: STAR_STROKE_RGBA,
    chip: null,
    centerAnchored: false,
  };
}

function buildDsoSpec(d: CatalogDso, text: string): LabelSpec {
  // DSO labels are mono-like and sit inside a subtle chip — the chip is what
  // separates them visually from a star label of the same size.
  const chip: LabelChip = {
    fill_rgba: DSO_CHIP_FILL,
    border_rgba: DSO_CHIP_BORDER,
    border_width: 1,
    padding_x: 6,
    padding_y: 3,
    radius: 4,
  };
  return {
    text,
    variant: 'dso',
    // Curated (Messier etc.) beat generic; brighter beat fainter.
    priority: (d.curated ? 180 : 140) - d.magnitude * 4,
    anchorX: d.x,
    anchorY: d.y,
    anchorRadius: 7,
    font_size: 17,
    font_weight: 600,
    font_family: 'mono',
    italic: false,
    letter_spacing: 0.03,
    stroke_width: 1.2,
    text_rgba: DSO_LABEL_RGBA,
    stroke_rgba: DSO_STROKE_RGBA,
    chip,
    centerAnchored: false,
  };
}

/**
 * Build an `OverlayScene` from the raw backend catalog using the user's current options.
 * The backend is queried once with max detail; all filtering and density controls
 * happen here so that parameter changes update the overlay without another round-trip.
 */
export function buildScene(catalog: Catalog, options: OverlayOptions): OverlayScene {
  const { stars, constellations, dsos, image_width, image_height } = catalog;
  const { layers, detail } = options;

  // Constellations
  const constellationsToShow = constellations.filter((c) => {
    if (detail.show_all_constellation_labels) return true;
    if (layers.contextual_constellation_labels) return true;
    return c.show_label;
  });

  const constellation_lines: OverlayLineSegment[] = constellations.flatMap((c) =>
    c.segments.map((s) => ({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      line_width: 2,
      rgba: LINE_RGBA,
    })),
  );

  // Stars: filter by magnitude, then cap to the density limit.
  const keptStars = sortStarsForLabeling(
    stars.filter((s) => s.magnitude <= detail.star_magnitude_limit),
  ).slice(0, Math.max(0, detail.star_label_limit));

  const star_markers: OverlayStarMarker[] = keptStars.map((s) => ({
    x: s.x,
    y: s.y,
    radius: starRadius(s.magnitude),
    fill_rgba: starFill(s.magnitude),
    outline_rgba: STAR_OUTLINE_RGBA,
  }));

  // DSOs
  const keptDsos = sortDsosForLabeling(
    dsos.filter((d) => d.magnitude <= detail.dso_magnitude_limit),
  ).slice(0, Math.max(0, detail.dso_label_limit));

  const deep_sky_markers: OverlayDeepSkyMarker[] = keptDsos.map((d) => ({
    marker: dsoMarkerShape(d.type_code),
    x: d.x,
    y: d.y,
    radius: 6,
    line_width: 2,
    rgba: dsoStroke(d.type_code),
  }));

  // Collect all labels, run a shared layout pass, then split back by variant
  // so the render order and per-type visibility controls keep working.
  const allSpecs: LabelSpec[] = [];
  for (const c of constellationsToShow) allSpecs.push(buildConstellationSpec(c));
  for (const s of keptStars) allSpecs.push(buildStarSpec(s));
  for (const d of keptDsos) {
    const text = detail.detailed_dso_labels ? d.detailed_label : d.primary_label;
    allSpecs.push(buildDsoSpec(d, text));
  }

  const laid = layoutLabels(allSpecs, image_width, image_height);

  const constellation_labels = laid.filter((l) => l.variant === 'constellation');
  const star_labels = laid.filter((l) => l.variant === 'star');
  const deep_sky_labels = laid.filter((l) => l.variant === 'dso');

  return {
    image_width,
    image_height,
    constellation_lines,
    constellation_labels,
    star_markers,
    star_labels,
    deep_sky_markers,
    deep_sky_labels,
  };
}
