import type {
  OverlayDeepSkyMarker,
  OverlayScene,
  OverlayStarMarker,
} from '@/types/api';
import type { DetailsFilters } from '@/state/store';

// Per-item filter model (see DetailsFilters in store.ts):
//   - Stars / constellations / DSOs each have a `hidden` Set<string> and a single
//     `solo` id (mutually exclusive within its category).
//   - Constellations join precisely: each figure carries `id` (IAU abbr) and each
//     constellation label carries `constellation` (the same abbr), so hide/solo
//     is per-figure — not an all-or-nothing toggle.
//   - Stars / DSOs: scene markers don't carry a stable id. Labels carry `text`
//     which equals the item's display `name`. Markers are correlated to their
//     label via leader endpoints (with tolerance), falling back to keeping
//     uncorrelated markers visible rather than dropping them arbitrarily.
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

  if (!starsActive && !constActive && !dsoActive) return scene;

  const keepByName = (name: string, hidden: Set<string>, solo: string | null): boolean => {
    if (solo !== null) return name === solo;
    return !hidden.has(name);
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
  if (starsActive) {
    star_labels = star_labels.filter((l) => keepByName(l.text, starsHidden, starSolo));
    // Map kept labels back to their markers via leader endpoints. A leader's
    // (x2,y2) is the star's screen position; match the nearest marker within
    // ~radius+1px. We don't drop markers without a leader match.
    const TOL = 3;
    const isNear = (m: OverlayStarMarker, p: { x: number; y: number }): boolean => {
      const tol = Math.max(TOL, m.radius + 1);
      return Math.abs(m.x - p.x) <= tol && Math.abs(m.y - p.y) <= tol;
    };
    const keptPoints: Array<{ x: number; y: number }> = [];
    for (const l of star_labels) {
      if (l.leader) keptPoints.push({ x: l.leader.x2, y: l.leader.y2 });
    }
    const removedLabelPoints: Array<{ x: number; y: number }> = [];
    for (const l of scene.star_labels) {
      if (!keepByName(l.text, starsHidden, starSolo) && l.leader) {
        removedLabelPoints.push({ x: l.leader.x2, y: l.leader.y2 });
      }
    }
    if (starSolo !== null) {
      // Prefer the positive filter when we have a leader anchor for the solo'd
      // label; otherwise degrade gracefully to the negative filter so we don't
      // wipe every marker just because the solo label lacks a leader.
      if (keptPoints.length > 0) {
        star_markers = star_markers.filter((m) => keptPoints.some((p) => isNear(m, p)));
      } else if (removedLabelPoints.length > 0) {
        star_markers = star_markers.filter(
          (m) => !removedLabelPoints.some((p) => isNear(m, p)),
        );
      }
      // else: no leader anywhere to correlate — leave markers as-is (better
      // than dropping arbitrary stars with zero correlation data).
    } else if (removedLabelPoints.length > 0) {
      // Hide-only mode: drop markers that correspond to removed labels.
      star_markers = star_markers.filter(
        (m) => !removedLabelPoints.some((p) => isNear(m, p)),
      );
    }
  }

  // --- DSOs ---
  let deep_sky_labels = scene.deep_sky_labels;
  let deep_sky_markers = scene.deep_sky_markers;
  if (dsoActive) {
    deep_sky_labels = deep_sky_labels.filter((l) => keepByName(l.text, dsosHidden, dsoSolo));
    const TOL = 4;
    const keptPoints: Array<{ x: number; y: number }> = [];
    for (const l of deep_sky_labels) {
      const p = l.leader ? { x: l.leader.x2, y: l.leader.y2 } : { x: l.x, y: l.y };
      keptPoints.push(p);
    }
    const removedLabelPoints: Array<{ x: number; y: number }> = [];
    for (const l of scene.deep_sky_labels) {
      if (!keepByName(l.text, dsosHidden, dsoSolo)) {
        removedLabelPoints.push(l.leader ? { x: l.leader.x2, y: l.leader.y2 } : { x: l.x, y: l.y });
      }
    }
    const isNear = (m: OverlayDeepSkyMarker, p: { x: number; y: number }): boolean => {
      const tol = Math.max(TOL, m.radius + 2);
      return Math.abs(m.x - p.x) <= tol && Math.abs(m.y - p.y) <= tol;
    };
    if (dsoSolo !== null) {
      deep_sky_markers = deep_sky_markers.filter((m) => keptPoints.some((p) => isNear(m, p)));
    } else if (removedLabelPoints.length > 0) {
      deep_sky_markers = deep_sky_markers.filter(
        (m) => !removedLabelPoints.some((p) => isNear(m, p)),
      );
    }
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
