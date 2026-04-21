import type {
  OverlayDeepSkyMarker,
  OverlayScene,
  OverlayStarMarker,
} from '@/types/api';
import type { DetailsFilters } from '@/state/store';

// Per-item filter model (see DetailsFilters in store.ts):
//   - Stars / constellations / DSOs each have a `hidden` Set<string> and a single
//     `solo` id (mutually exclusive within its category).
//   - Scene items (lines, star/DSO markers, labels) do not carry a stable id —
//     the only joinable field is `OverlayTextItem.text`, which equals the
//     item's display `name` in the result payload. All filtering flows through
//     that name, with two fallbacks:
//       1. Constellation lines have no text. We join them via the label set:
//          when a constellation is solo'd/hidden, the WHOLE line collection is
//          shown/hidden together. (Trade-off: we can't keep one constellation's
//          lines visible while hiding another's unless a label exists for the
//          hidden one — in practice, constellation_labels is comprehensive.)
//          Concretely: if a solo is set and its name has no label, lines are
//          hidden. If hidden set contains ALL rendered constellations, lines
//          hide. Otherwise we just drop lines whose nearest label was removed;
//          since we can't spatially attribute segments cheaply, we take the
//          conservative approach — lines survive if any non-hidden
//          constellation label is present.
//       2. Star markers have no text. We correlate markers to star_labels by
//          the label's `leader` endpoint (x2,y2) which points at the star,
//          snap-matched with a small tolerance. Markers without a matching
//          label get the benefit of the doubt and remain visible (they can
//          only be hidden through the label pipeline).
//       3. DSO markers: same leader-endpoint correlation. Where a leader is
//          absent, we match by proximity to the label's anchor (x,y).
//
// Shared between the live overlay (OverlayCanvas.tsx) and the export path
// (composite.ts) so saved PNGs mirror what the user sees on screen.
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
  let constellation_labels = scene.constellation_labels;
  let constellation_lines = scene.constellation_lines;
  if (constActive) {
    constellation_labels = constellation_labels.filter((l) =>
      keepByName(l.text, constellationsHidden, constellationSolo),
    );
    // Lines: coarse behaviour — if solo is set, only keep lines if the solo'd
    // constellation's label survived. Otherwise keep lines whenever at least
    // one constellation label remains visible (matches the documented trade-off).
    if (constellationSolo !== null) {
      const hasSoloLabel = constellation_labels.some((l) => l.text === constellationSolo);
      constellation_lines = hasSoloLabel ? constellation_lines : [];
    } else if (constellation_labels.length === 0) {
      constellation_lines = [];
    }
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
    constellation_lines,
    constellation_labels,
    star_markers,
    star_labels,
    deep_sky_markers,
    deep_sky_labels,
  };
}
