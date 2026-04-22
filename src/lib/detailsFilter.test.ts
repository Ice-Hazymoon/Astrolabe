import { describe, expect, test } from 'bun:test';
import { applyDetailsFilters } from './detailsFilter';
import type { OverlayScene } from '@/types/api';
import type { DetailsFilters } from '@/state/store';

const baseScene: OverlayScene = {
  image_width: 1000,
  image_height: 800,
  constellation_figures: [
    { id: 'Ori', segments: [] },
    { id: 'Tau', segments: [] },
  ],
  constellation_labels: [
    {
      text: 'Orion',
      constellation: 'Ori',
      x: 10,
      y: 10,
      font_size: 12,
      stroke_width: 1,
      text_rgba: [255, 255, 255, 255],
      stroke_rgba: [0, 0, 0, 255],
    },
    {
      text: 'Taurus',
      constellation: 'Tau',
      x: 20,
      y: 20,
      font_size: 12,
      stroke_width: 1,
      text_rgba: [255, 255, 255, 255],
      stroke_rgba: [0, 0, 0, 255],
    },
  ],
  star_markers: [
    { id: 'betelgeuse', x: 1, y: 1, radius: 1, fill_rgba: [1, 1, 1, 255], outline_rgba: [0, 0, 0, 255] },
    { id: 'aldebaran', x: 2, y: 2, radius: 1, fill_rgba: [1, 1, 1, 255], outline_rgba: [0, 0, 0, 255] },
  ],
  star_labels: [
    {
      entity_id: 'betelgeuse',
      text: 'Betelgeuse',
      x: 1,
      y: 1,
      font_size: 12,
      stroke_width: 1,
      text_rgba: [255, 255, 255, 255],
      stroke_rgba: [0, 0, 0, 255],
    },
    {
      entity_id: 'aldebaran',
      text: 'Aldebaran',
      x: 2,
      y: 2,
      font_size: 12,
      stroke_width: 1,
      text_rgba: [255, 255, 255, 255],
      stroke_rgba: [0, 0, 0, 255],
    },
  ],
  deep_sky_markers: [
    { id: 'm42', marker: 'circle', x: 3, y: 3, radius: 1, line_width: 1, rgba: [1, 1, 1, 255] },
    { id: 'm45', marker: 'circle', x: 4, y: 4, radius: 1, line_width: 1, rgba: [1, 1, 1, 255] },
  ],
  deep_sky_labels: [
    {
      entity_id: 'm42',
      text: 'M42',
      x: 3,
      y: 3,
      font_size: 12,
      stroke_width: 1,
      text_rgba: [255, 255, 255, 255],
      stroke_rgba: [0, 0, 0, 255],
    },
    {
      entity_id: 'm45',
      text: 'M45',
      x: 4,
      y: 4,
      font_size: 12,
      stroke_width: 1,
      text_rgba: [255, 255, 255, 255],
      stroke_rgba: [0, 0, 0, 255],
    },
  ],
};

const emptyFilters = (): DetailsFilters => ({
  starsHidden: new Set<string>(),
  starSolo: null,
  constellationsHidden: new Set<string>(),
  constellationSolo: null,
  dsosHidden: new Set<string>(),
  dsoSolo: null,
});

describe('applyDetailsFilters', () => {
  test('soloing a star hides every other category and keeps only that star and label', () => {
    const filtered = applyDetailsFilters(baseScene, {
      ...emptyFilters(),
      starSolo: 'betelgeuse',
    });

    expect(filtered.star_markers.map((marker) => marker.id)).toEqual(['betelgeuse']);
    expect(filtered.star_labels.map((label) => label.entity_id)).toEqual(['betelgeuse']);
    expect(filtered.constellation_figures).toHaveLength(0);
    expect(filtered.constellation_labels).toHaveLength(0);
    expect(filtered.deep_sky_markers).toHaveLength(0);
    expect(filtered.deep_sky_labels).toHaveLength(0);
  });

  test('soloing a constellation hides stars and deep sky objects', () => {
    const filtered = applyDetailsFilters(baseScene, {
      ...emptyFilters(),
      constellationSolo: 'Ori',
    });

    expect(filtered.constellation_figures.map((figure) => figure.id)).toEqual(['Ori']);
    expect(filtered.constellation_labels.map((label) => label.constellation)).toEqual(['Ori']);
    expect(filtered.star_markers).toHaveLength(0);
    expect(filtered.star_labels).toHaveLength(0);
    expect(filtered.deep_sky_markers).toHaveLength(0);
    expect(filtered.deep_sky_labels).toHaveLength(0);
  });

  test('soloing a deep sky object hides stars and constellations', () => {
    const filtered = applyDetailsFilters(baseScene, {
      ...emptyFilters(),
      dsoSolo: 'm42',
    });

    expect(filtered.deep_sky_markers.map((marker) => marker.id)).toEqual(['m42']);
    expect(filtered.deep_sky_labels.map((label) => label.entity_id)).toEqual(['m42']);
    expect(filtered.star_markers).toHaveLength(0);
    expect(filtered.star_labels).toHaveLength(0);
    expect(filtered.constellation_figures).toHaveLength(0);
    expect(filtered.constellation_labels).toHaveLength(0);
  });
});
