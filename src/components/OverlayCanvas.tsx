import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type {
  LabelFontFamily,
  OverlayDeepSkyMarker,
  OverlayLineSegment,
  OverlayScene,
  OverlayStarMarker,
  OverlayTextItem,
  RgbaTuple,
} from '@/types/api';
import { useSky } from '@/state/store';
import { applyDetailsFilters } from '@/lib/detailsFilter';

const FONT_SANS =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans", "Microsoft YaHei", sans-serif';
const FONT_SERIF =
  '"Spectral", "Noto Serif SC", "Iowan Old Style", Georgia, "Songti SC", serif';
const FONT_MONO =
  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function fontFamilyFor(family: LabelFontFamily | undefined): string {
  switch (family) {
    case 'serif':
      return FONT_SERIF;
    case 'mono':
      return FONT_MONO;
    case 'sans':
    default:
      return FONT_SANS;
  }
}

function estimateTextWidth(
  text: string,
  fontSize: number,
  family: LabelFontFamily | undefined,
  italic: boolean,
  letterSpacingEm: number,
): number {
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

interface OverlayCanvasProps {
  scene: OverlayScene;
  layers: {
    constellation_lines: boolean;
    constellation_labels: boolean;
    star_markers: boolean;
    star_labels: boolean;
    deep_sky_markers: boolean;
    deep_sky_labels: boolean;
    label_leaders: boolean;
  };
  /** Animate elements on mount. Disable for instant paint (e.g. history restore). */
  animate?: boolean;
  className?: string;
}

function rgba(tuple: RgbaTuple, alphaScale = 1): string {
  const [r, g, b, a] = tuple;
  const alpha = Math.min(255, a * alphaScale);
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${(alpha / 255).toFixed(3)})`;
}

// Visual tuning constants for the overlay — tweaked so lines read crisp and
// stars feel lively without losing the underlying photograph.
const LINE_ALPHA_BOOST = 1.45;
const LINE_WIDTH_BOOST = 1.3;
// How far to mix constellation-line color toward pure white (0 = server color,
// 1 = white). Keeps a hint of the source tint while reading cleaner on photos.
const LINE_WHITEN = 0.6;

function lineStroke(tuple: RgbaTuple): string {
  const [r, g, b, a] = tuple;
  const wr = r + (255 - r) * LINE_WHITEN;
  const wg = g + (255 - g) * LINE_WHITEN;
  const wb = b + (255 - b) * LINE_WHITEN;
  const alpha = Math.min(255, a * LINE_ALPHA_BOOST);
  return `rgba(${wr | 0}, ${wg | 0}, ${wb | 0}, ${(alpha / 255).toFixed(3)})`;
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

const Lines = memo(function Lines({
  segments,
  animate,
}: {
  segments: OverlayLineSegment[];
  animate: boolean;
}) {
  if (!animate) {
    return (
      <g>
        {segments.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={lineStroke(s.rgba)}
            strokeWidth={s.line_width * LINE_WIDTH_BOOST}
            strokeLinecap="round"
          />
        ))}
      </g>
    );
  }

  return (
    <g filter="url(#overlay-line-glow)">
      {segments.map((s, i) => (
        <motion.line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={lineStroke(s.rgba)}
          strokeWidth={s.line_width * LINE_WIDTH_BOOST}
          strokeLinecap="round"
          initial={animate ? { pathLength: 0, opacity: 0 } : false}
          animate={animate ? { pathLength: 1, opacity: 1 } : undefined}
          transition={
            animate
              ? {
                  duration: 1.8,
                  delay: 0.12 + i * 0.008,
                  ease: [0.22, 1, 0.36, 1],
                }
              : undefined
          }
        />
      ))}
    </g>
  );
});

const Leaders = memo(function Leaders({
  labels,
  animate,
  delayBase,
}: {
  labels: OverlayTextItem[];
  animate: boolean;
  delayBase: number;
}) {
  if (!animate) {
    return (
      <g>
        {labels.map((l, i) =>
          l.leader ? (
            <line
              key={i}
              x1={l.leader.x1}
              y1={l.leader.y1}
              x2={l.leader.x2}
              y2={l.leader.y2}
              stroke={rgba(l.leader.rgba)}
              strokeWidth={l.leader.line_width}
              strokeLinecap="round"
            />
          ) : null,
        )}
      </g>
    );
  }

  return (
    <g>
      {labels.map((l, i) =>
        l.leader ? (
          <motion.line
            key={i}
            x1={l.leader.x1}
            y1={l.leader.y1}
            x2={l.leader.x2}
            y2={l.leader.y2}
            stroke={rgba(l.leader.rgba)}
            strokeWidth={l.leader.line_width}
            strokeLinecap="round"
            initial={animate ? { opacity: 0 } : false}
            animate={animate ? { opacity: 1 } : undefined}
            transition={animate ? { duration: 0.7, delay: delayBase + i * 0.024 } : undefined}
          />
        ) : null,
      )}
    </g>
  );
});

/**
 * Star marker: an outlined ring that *surrounds* the photographed star rather than
 * covering it, plus a soft outer halo. Animates in by growing its radius from 0 at
 * the star's own coordinates (no sliding), then holds perfectly still.
 */
const StarMarkers = memo(function StarMarkers({
  stars,
  animate,
  delayBase,
}: {
  stars: OverlayStarMarker[];
  animate: boolean;
  delayBase: number;
}) {
  if (!animate) {
    return (
      <g>
        {stars.map((m, i) => {
          const ringR = m.radius + 2.6;
          const haloR = m.radius + 5.2;
          return (
            <g key={i}>
              <circle
                cx={m.x}
                cy={m.y}
                r={haloR}
                fill="none"
                stroke={rgba(m.fill_rgba)}
                strokeOpacity={0.7}
                strokeWidth={1.6}
              />
              <circle
                cx={m.x}
                cy={m.y}
                r={ringR}
                fill="none"
                stroke={rgba(m.outline_rgba)}
                strokeWidth={1.8}
              />
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <g filter="url(#overlay-star-glow)">
      {stars.map((m, i) => {
        const ringR = m.radius + 2.6;
        const haloR = m.radius + 5.2;
        const delay = delayBase + i * 0.036;
        return (
          <g key={i}>
            <motion.circle
              cx={m.x}
              cy={m.y}
              fill="none"
              stroke={rgba(m.fill_rgba)}
              strokeWidth={1.6}
              initial={animate ? { r: 0, opacity: 0, strokeOpacity: 0 } : false}
              animate={
                animate
                  ? {
                      r: [0, haloR * 1.35, haloR],
                      opacity: [0, 1, 1],
                      strokeOpacity: [0, 1, 0.7],
                    }
                  : { r: haloR, strokeOpacity: 0.7 }
              }
              transition={
                animate
                  ? {
                      duration: 1.15,
                      delay,
                      times: [0, 0.55, 1],
                      ease: [0.22, 1, 0.36, 1],
                    }
                  : undefined
              }
            />
            <motion.circle
              cx={m.x}
              cy={m.y}
              fill="none"
              stroke={rgba(m.outline_rgba)}
              strokeWidth={1.8}
              initial={animate ? { r: 0, opacity: 0 } : false}
              animate={
                animate
                  ? { r: [0, ringR * 1.25, ringR], opacity: [0, 1, 1] }
                  : { r: ringR }
              }
              transition={
                animate
                  ? {
                      duration: 0.95,
                      delay: delay + 0.1,
                      times: [0, 0.55, 1],
                      ease: [0.22, 1, 0.36, 1],
                    }
                  : undefined
              }
            />
          </g>
        );
      })}
    </g>
  );
});

const DeepSkyMarkers = memo(function DeepSkyMarkers({
  markers,
  animate,
  delayBase,
}: {
  markers: OverlayDeepSkyMarker[];
  animate: boolean;
  delayBase: number;
}) {
  if (!animate) {
    return (
      <g>
        {markers.map((m, i) => (
          <path
            key={i}
            d={deepSkyPath(m)}
            fill="none"
            stroke={rgba(m.rgba)}
            strokeWidth={m.line_width}
            strokeLinejoin="round"
          />
        ))}
      </g>
    );
  }

  return (
    <g>
      {markers.map((m, i) => (
        <motion.path
          key={i}
          d={deepSkyPath(m)}
          fill="none"
          stroke={rgba(m.rgba)}
          strokeWidth={m.line_width}
          strokeLinejoin="round"
          initial={animate ? { opacity: 0 } : false}
          animate={animate ? { opacity: 1 } : undefined}
          transition={
            animate
              ? { duration: 0.9, delay: delayBase + i * 0.024, ease: [0.22, 1, 0.36, 1] }
              : undefined
          }
        />
      ))}
    </g>
  );
});

const Labels = memo(function Labels({
  items,
  animate,
  delayBase,
}: {
  items: OverlayTextItem[];
  animate: boolean;
  delayBase: number;
}) {
  if (!animate) {
    return (
      <g>
        {items.map((t, i) => {
          const family = fontFamilyFor(t.font_family);
          const weight = t.font_weight ?? 600;
          const italic = t.italic ?? false;
          const letterSpacingEm = t.letter_spacing ?? 0;
          const textW =
            t.text_width ??
            estimateTextWidth(t.text, t.font_size, t.font_family, italic, letterSpacingEm);
          const ascent = t.font_size * 0.82;
          const descent = t.font_size * 0.24;

          return (
            <g key={i}>
              {t.chip ? (
                <rect
                  x={t.x - t.chip.padding_x}
                  y={t.y - ascent - t.chip.padding_y}
                  width={textW + t.chip.padding_x * 2}
                  height={ascent + descent + t.chip.padding_y * 2}
                  rx={t.chip.radius}
                  ry={t.chip.radius}
                  fill={rgba(t.chip.fill_rgba)}
                  stroke={t.chip.border_rgba ? rgba(t.chip.border_rgba) : 'none'}
                  strokeWidth={t.chip.border_width ?? 1}
                />
              ) : null}
              <text
                x={t.x}
                y={t.y}
                fontSize={t.font_size}
                fontWeight={weight}
                fontFamily={family}
                fontStyle={italic ? 'italic' : 'normal'}
                fill={rgba(t.text_rgba)}
                stroke={rgba(t.stroke_rgba)}
                strokeWidth={t.stroke_width}
                letterSpacing={letterSpacingEm ? `${letterSpacingEm}em` : undefined}
                style={{ paintOrder: 'stroke fill' }}
                textAnchor="start"
                dominantBaseline="alphabetic"
              >
                {t.text}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <g>
      {items.map((t, i) => {
        const family = fontFamilyFor(t.font_family);
        const weight = t.font_weight ?? 600;
        const italic = t.italic ?? false;
        const letterSpacingEm = t.letter_spacing ?? 0;
        const textW =
          t.text_width ??
          estimateTextWidth(t.text, t.font_size, t.font_family, italic, letterSpacingEm);
        const ascent = t.font_size * 0.82;
        const descent = t.font_size * 0.24;

        const delay = delayBase + i * 0.04;

        return (
          <motion.g
            key={i}
            initial={animate ? { opacity: 0, y: 4 } : false}
            animate={animate ? { opacity: 1, y: 0 } : undefined}
            transition={animate ? { duration: 0.6, delay } : undefined}
          >
            {t.chip ? (
              <rect
                x={t.x - t.chip.padding_x}
                y={t.y - ascent - t.chip.padding_y}
                width={textW + t.chip.padding_x * 2}
                height={ascent + descent + t.chip.padding_y * 2}
                rx={t.chip.radius}
                ry={t.chip.radius}
                fill={rgba(t.chip.fill_rgba)}
                stroke={t.chip.border_rgba ? rgba(t.chip.border_rgba) : 'none'}
                strokeWidth={t.chip.border_width ?? 1}
              />
            ) : null}
            <text
              x={t.x}
              y={t.y}
              fontSize={t.font_size}
              fontWeight={weight}
              fontFamily={family}
              fontStyle={italic ? 'italic' : 'normal'}
              fill={rgba(t.text_rgba)}
              stroke={rgba(t.stroke_rgba)}
              strokeWidth={t.stroke_width}
              letterSpacing={letterSpacingEm ? `${letterSpacingEm}em` : undefined}
              style={{ paintOrder: 'stroke fill' }}
              textAnchor="start"
              dominantBaseline="alphabetic"
            >
              {t.text}
            </text>
          </motion.g>
        );
      })}
    </g>
  );
});

export const OverlayCanvas = memo(function OverlayCanvas({
  scene,
  layers,
  animate = true,
  className,
}: OverlayCanvasProps) {
  const { t } = useTranslation('viewer');
  const filters = useSky((s) => s.detailsFilters);
  const filteredScene = useMemo(() => applyDetailsFilters(scene, filters), [scene, filters]);
  const { image_width: W, image_height: H } = filteredScene;
  const clipId = `overlay-clip-${W}x${H}`;

  const visible = useMemo(
    () => ({
      lines: layers.constellation_lines ? filteredScene.constellation_lines : [],
      constLabels: layers.constellation_labels ? filteredScene.constellation_labels : [],
      stars: layers.star_markers ? filteredScene.star_markers : [],
      starLabels: layers.star_labels ? filteredScene.star_labels : [],
      dsos: layers.deep_sky_markers ? filteredScene.deep_sky_markers : [],
      // Labels follow their parent marker — turning markers off also hides their names.
      dsoLabels:
        layers.deep_sky_markers && layers.deep_sky_labels ? filteredScene.deep_sky_labels : [],
    }),
    [filteredScene, layers],
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={t('overlayAria')}
      focusable="false"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
        {/* Soft bloom for constellation lines — keeps stars visible underneath. */}
        <filter
          id="overlay-line-glow"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          filterUnits="objectBoundingBox"
        >
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Brighter bloom for star rings so they pop against the photograph. */}
        <filter
          id="overlay-star-glow"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          filterUnits="objectBoundingBox"
        >
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <Lines segments={visible.lines} animate={animate} />

        {layers.label_leaders && (
          <>
            <Leaders labels={visible.starLabels} animate={animate} delayBase={0.4} />
            <Leaders labels={visible.dsoLabels} animate={animate} delayBase={0.48} />
          </>
        )}

        <DeepSkyMarkers markers={visible.dsos} animate={animate} delayBase={0.36} />
        <StarMarkers stars={visible.stars} animate={animate} delayBase={0.28} />

        <Labels items={visible.constLabels} animate={animate} delayBase={0.56} />
        <Labels items={visible.starLabels} animate={animate} delayBase={0.68} />
        <Labels items={visible.dsoLabels} animate={animate} delayBase={0.76} />
      </g>
    </svg>
  );
});
