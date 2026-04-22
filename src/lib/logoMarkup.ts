import { LOGO_DATA_URI } from '@/lib/logoAsset';

export function logoSvgMarkup(): string {
  return (
    `<image href="${LOGO_DATA_URI}" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`
  );
}
