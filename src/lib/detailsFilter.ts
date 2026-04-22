import type { OverlayScene } from '@/types/api';
import type { DetailsFilters } from '@/state/store';

// Per-item filter model (see DetailsFilters in store.ts):
//   - Stars / constellations / DSOs each have a `hidden` Set<string> and a single
//     `solo` id (mutually exclusive within its category).
//   - Constellations join precisely: each figure carries `id` (IAU abbr) and each
//     constellation label carries `constellation` (the same abbr), so hide/solo
//     is per-figure — not an all-or-nothing toggle.
//   - Stars / DSOs now carry stable ids on both markers and labels, so hide/solo
//     applies exactly (no leader/position heuristics required).
//   - Constellation filters also constrain linked stars: hiding a constellation
//     hides its member stars, and soloing a constellation keeps only that
//     constellation's lines / labels plus stars linked to it.
//
// Shared between the live overlay (OverlayCanvas.tsx) and the export path
// (composite.ts / videoExport.ts) so saved PNGs and MP4s mirror what the user
// sees on screen.
export function applyDetailsFilters(
  scene: OverlayScene,
  filters: DetailsFilters,
): OverlayScene {
  const {
    starsHidden,
    starSolo,
    constellationsHidden,
    constellationSolo,
    dsosHidden,
    dsoSolo,
  } = filters;

  const starsActive = starsHidden.size > 0 || starSolo !== null;
  const constActive = constellationsHidden.size > 0 || constellationSolo !== null;
  const dsoActive = dsosHidden.size > 0 || dsoSolo !== null;
  const activeSolo =
    starSolo !== null
      ? { category: 'stars' as const, id: starSolo }
      : constellationSolo !== null
        ? { category: 'constellations' as const, id: constellationSolo }
        : dsoSolo !== null
          ? { category: 'dsos' as const, id: dsoSolo }
          : null;

  if (!starsActive && !constActive && !dsoActive) return scene;

  if (activeSolo) {
    return {
      ...scene,
      constellation_figures:
        activeSolo.category === 'constellations'
          ? scene.constellation_figures.filter((figure) => figure.id === activeSolo.id)
          : [],
      constellation_labels:
        activeSolo.category === 'constellations'
          ? scene.constellation_labels.filter((label) => label.constellation === activeSolo.id)
          : [],
      star_markers:
        activeSolo.category === 'stars'
          ? scene.star_markers.filter((marker) => marker.id === activeSolo.id)
          : [],
      star_labels:
        activeSolo.category === 'stars'
          ? scene.star_labels.filter((label) => label.entity_id === activeSolo.id)
          : [],
      deep_sky_markers:
        activeSolo.category === 'dsos'
          ? scene.deep_sky_markers.filter((marker) => marker.id === activeSolo.id)
          : [],
      deep_sky_labels:
        activeSolo.category === 'dsos'
          ? scene.deep_sky_labels.filter((label) => label.entity_id === activeSolo.id)
          : [],
    };
  }

  const keepByKey = (key: string | undefined, hidden: Set<string>, solo: string | null): boolean => {
    if (!key) return solo === null;
    if (solo !== null) return key === solo;
    return !hidden.has(key);
  };
  const keepByConstellationMembership = (
    constellationIds: string[] | undefined,
    {
      unknownWhenHide = true,
      unknownWhenSolo = false,
    }: { unknownWhenHide?: boolean; unknownWhenSolo?: boolean } = {},
  ): boolean => {
    if (!constActive) return true;
    if (!constellationIds || constellationIds.length === 0) {
      return constellationSolo !== null ? unknownWhenSolo : unknownWhenHide;
    }
    if (constellationSolo !== null) return constellationIds.includes(constellationSolo);
    return !constellationIds.some((abbr) => constellationsHidden.has(abbr));
  };

  // --- Constellations ---
  // Figures are already keyed by IAU abbr; constellation labels carry the same
  // abbr (attached by buildScene()). Both filter on the same join key — no
  // positional/text heuristics needed.
  let constellation_labels = scene.constellation_labels;
  let constellation_figures = scene.constellation_figures;
  if (constActive) {
    const keepConst = (abbr: string | undefined): boolean => {
      // Defensive: if a label somehow lacks `constellation` we keep it rather
      // than dropping silently — this should never happen in practice because
      // buildScene() attaches the abbr on every constellation label.
      if (!abbr) return true;
      if (constellationSolo !== null) return abbr === constellationSolo;
      return !constellationsHidden.has(abbr);
    };
    constellation_labels = constellation_labels.filter((l) => keepConst(l.constellation));
    constellation_figures = constellation_figures.filter((f) => keepConst(f.id));
  }

  // --- Stars ---
  let star_labels = scene.star_labels;
  let star_markers = scene.star_markers;
  if (starsActive || constActive) {
    star_labels = star_labels.filter(
      (label) =>
        keepByKey(label.entity_id, starsHidden, starSolo) &&
        keepByConstellationMembership(label.constellation_ids),
    );
    star_markers = star_markers.filter(
      (marker) =>
        keepByKey(marker.id, starsHidden, starSolo) &&
        keepByConstellationMembership(marker.constellation_ids),
    );
  }

  // --- DSOs ---
  let deep_sky_labels = scene.deep_sky_labels;
  let deep_sky_markers = scene.deep_sky_markers;
  if (constellationSolo !== null) {
    // "Solo constellation" is a focused mode: keep the chosen figure, its
    // label, and linked stars only. DSOs stay independent otherwise because
    // we don't have a reliable constellation-membership mapping for them.
    deep_sky_labels = [];
    deep_sky_markers = [];
  } else if (dsoActive) {
    deep_sky_labels = deep_sky_labels.filter((l) => keepByKey(l.entity_id, dsosHidden, dsoSolo));
    deep_sky_markers = deep_sky_markers.filter((marker) =>
      keepByKey(marker.id, dsosHidden, dsoSolo),
    );
  }

  return {
    ...scene,
    constellation_figures,
    constellation_labels,
    star_markers,
    star_labels,
    deep_sky_markers,
    deep_sky_labels,
  };
}
