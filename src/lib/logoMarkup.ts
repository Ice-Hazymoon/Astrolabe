// Single source of truth for the Stellaris glyph — used by both the React
// component (see components/ui/Logo.tsx) and the exported image strip
// (see lib/composite.ts). Keeping the geometry here lets canvas composition
// embed the mark without pulling in React.

export const LOGO_ORBIT_R = 11;
export const LOGO_STAR_PATH =
  'M16 6.6 L17.8 14.2 L25.4 16 L17.8 17.8 L16 25.4 L14.2 17.8 L6.6 16 L14.2 14.2 Z';
export const LOGO_SATELLITE = { cx: 25.5, cy: 8.4, r: 1.55 };

export function logoSvgMarkup(color: string): string {
  return (
    `<g fill="${color}">` +
    `<circle cx="16" cy="16" r="${LOGO_ORBIT_R}" fill="none" stroke="${color}" stroke-width="1.2" stroke-opacity="0.55" />` +
    `<path d="${LOGO_STAR_PATH}" />` +
    `<circle cx="${LOGO_SATELLITE.cx}" cy="${LOGO_SATELLITE.cy}" r="${LOGO_SATELLITE.r}" />` +
    `</g>`
  );
}
