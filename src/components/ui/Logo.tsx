import { forwardRef, type SVGProps } from 'react';
import { LOGO_ORBIT_R, LOGO_SATELLITE, LOGO_STAR_PATH } from '@/lib/logoMarkup';

/**
 * Stellaris glyph — a stylized compass-star riding an orbital ring with a
 * single marked satellite waypoint. Drawn in `currentColor` so it can be
 * tinted by its surrounding context. The matching canvas-safe SVG markup
 * lives in `lib/logoMarkup.ts` so both renderers share the same geometry.
 */
export const Logo = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(function Logo(
  { strokeOpacity = 0.55, ...rest },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden
      {...rest}
    >
      <circle
        cx="16"
        cy="16"
        r={LOGO_ORBIT_R}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeOpacity={strokeOpacity}
      />
      <path d={LOGO_STAR_PATH} />
      <circle cx={LOGO_SATELLITE.cx} cy={LOGO_SATELLITE.cy} r={LOGO_SATELLITE.r} />
    </svg>
  );
});
