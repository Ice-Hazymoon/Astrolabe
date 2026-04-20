import { describe, expect, test } from 'bun:test';
import { buildStripSvg } from './composite';

describe('buildStripSvg', () => {
  test('truncates extremely long location names with an ellipsis', () => {
    const svg = buildStripSvg(1600, 180, {
      locationName:
        '12345 Very Long Observatory Ridge Road, Dark Sky Reserve, Extremely Verbose County, Somewhere Remote',
      coordinates: '35.6895°N   139.6917°E',
      siteName: 'Stellaris',
      siteUrl: 'stellaris.example',
    });

    // Location always renders on a single line; when overflowing, the last
    // characters are replaced with an ellipsis.
    expect(svg).toContain('…');
    expect(svg).not.toContain('</tspan><tspan');
  });

  test('renders a short location name on a single line without truncation', () => {
    const svg = buildStripSvg(1600, 180, {
      locationName: 'Seattle, WA',
      coordinates: '47.6062°N   122.3321°W',
      siteName: 'Stellaris',
      siteUrl: 'stellaris.example',
    });

    expect(svg).toContain('Seattle, WA');
    expect(svg).toContain('47.6062');
  });

  test('middle-truncates long site hosts so the footer keeps its layout', () => {
    const svg = buildStripSvg(760, 150, {
      locationName: '',
      coordinates: '',
      siteName: 'Stellaris',
      siteUrl:
        'preview-super-long-subdomain-for-qa-and-review.stellaris-night-sky.example.dev',
    });

    // Middle-truncation keeps a prefix + a suffix joined by an ellipsis.
    expect(svg).toContain('preview');
    expect(svg).toContain('.dev');
    expect(svg).toContain('…');
  });

  test('renders stats as inline icon + number pairs', () => {
    const svg = buildStripSvg(1600, 180, {
      locationName: 'Seattle, WA',
      coordinates: '47.6°N 122.3°W',
      siteName: 'Stellaris',
      siteUrl: 'stellaris.example',
      stats: { stars: 47, constellations: 3, deepSky: 5 },
    });

    expect(svg).toContain('>47<');
    expect(svg).toContain('>3<');
    expect(svg).toContain('>5<');
  });
});
