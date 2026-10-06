// Automatic lane placement and band detection, driven by the well map.

import type { GrayImage } from './image';
import { suggestLadderSizes } from './ladderMatch';
import { bandCountProfile, columnProfile, findPeaks, fitLaneGrid, laneFloor, laneProfile, snapToPeak, type GridRow } from './profile';
import { ladderFor, laneKey, rowCount, rowSpan, type Band, type Project } from './project';

export { rowSpan };

let nextId = 1;
export const bandId = () => `b${nextId++}`;

/** Default well lines (evenly split rows) and lanes fitted to the image. */
export function autoLanes(project: Project, img: GrayImage): Pick<Project, 'rowTops' | 'laneX' | 'laneHalfWidth'> {
  const rows = rowCount(project);
  const rowTops =
    project.rowTops.length === rows
      ? project.rowTops
      : Array.from({ length: rows }, (_, r) => Math.round(((r + 0.06) * img.height) / rows));
  const rowsOf = (count: number) =>
    project.rowWells.flatMap((c, r) => (c === count ? [r] : []));
  const gridRow = (r: number): GridRow => {
    const span = rowSpan({ rowTops }, r + 1, img.height);
    const role = (k: number) => project.wells.find((w) => w.row === r + 1 && w.index === k + 1)?.role;
    const wells = Array.from({ length: project.rowWells[r] }, (_, k) => role(k));
    return {
      profile: columnProfile(img, span.start, span.bottom),
      empty: wells.map((role) => role === 'empty'),
      ladder: wells.map((role) => role === 'ladder'),
      bandCount: bandCountProfile(img, span.start, span.bottom),
    };
  };
  const gridRows = Array.from({ length: rows }, (_, r) => gridRow(r));

  // Rows with the same number of wells almost always come from the same comb,
  // so fit them together: a row with empty wells or a dim ladder can't slide
  // its grid along by a lane when the other rows pin it. Each row may then
  // shift a little, as combs are rarely placed exactly in line.
  const shared = new Map<number, { first: number; spacing: number }>();
  for (const count of new Set(project.rowWells)) {
    shared.set(count, fitLaneGrid(rowsOf(count).map((r) => gridRows[r]), count));
  }

  const laneX: Record<string, number> = {};
  let spacing = Infinity;
  for (let row = 1; row <= rows; row++) {
    const count = project.rowWells[row - 1];
    const base = shared.get(count)!;
    const grid = count > 1 ? fitLaneGrid([gridRows[row - 1]], count, { ...base, maxShift: base.spacing * 0.4 }) : base;
    // one lane width for the whole gel: fit the most tightly packed row
    spacing = Math.min(spacing, count > 1 ? grid.spacing : img.width / 2);
    for (let index = 1; index <= count; index++) {
      laneX[laneKey({ row, index })] = grid.first + (index - 1) * grid.spacing;
    }
  }
  return { rowTops, laneX, laneHalfWidth: Math.round(spacing * 0.35) };
}

function profileFor(project: Project, img: GrayImage, row: number, index: number) {
  const key = laneKey({ row, index });
  const span = rowSpan(project, row, img.height);
  return {
    key,
    span,
    profile: laneProfile(img, project.laneX[key], project.laneHalfWidth, span.start, span.bottom),
  };
}

/**
 * Detect bands in every non-empty lane. Bands the user added by hand are
 * kept; previous automatic bands are replaced.
 */
export function detectBands(project: Project, img: GrayImage, sensitivity: number): Band[] {
  const kept = project.bands.filter((b) => b.source === 'manual').map((b) => ({ ...b }));
  const found: Band[] = [];

  for (const well of project.wells) {
    if (well.role === 'empty') continue;
    const { key, span, profile } = profileFor(project, img, well.row, well.index);
    const manualHere = kept.filter((b) => b.laneKey === key);
    const peaks = findPeaks(profile, { sensitivity }).filter((p) =>
      manualHere.every((m) => Math.abs(m.y - (p.index + span.start)) > 4),
    );
    const bands: Band[] = peaks.map((p) => ({
      id: bandId(),
      laneKey: key,
      y: p.index + span.start,
      source: 'auto',
      intensity: p.brightness,
    }));

    found.push(...bands);
  }
  return relabelLadders(project, [...kept, ...found], undefined, img.height);
}

/** Suggest ladder sizes for every ladder lane, leaving sizes the user picked alone. */
export function relabelLadders(project: Project, bands: Band[], onlyLane?: string, imageHeight?: number): Band[] {
  const out = bands.map((b) => ({ ...b }));
  for (const well of project.wells) {
    const key = laneKey(well);
    const ladder = well.role === 'ladder' ? ladderFor(well) : undefined;
    if (!ladder || (onlyLane && key !== onlyLane)) continue;
    const lane = out.filter((b) => b.laneKey === key);
    const locked = new Set(lane.filter((b) => b.sizeLocked).map((b) => b.ladderSize));
    const free = lane.filter((b) => !b.sizeLocked);
    const span = rowSpan(project, well.row, Infinity);
    const sizes = suggestLadderSizes(
      free,
      ladder.bands.filter((lb) => !locked.has(lb.size)),
      { top: span.start, bottom: project.rowTops[well.row] !== undefined ? span.bottom : (imageHeight ?? Infinity) },
    );
    free.forEach((b, i) => {
      b.ladderSize = sizes[i];
    });
  }
  return out;
}

/** A band added by clicking: snapped to the nearest brightness maximum. */
export function manualBand(project: Project, img: GrayImage, row: number, index: number, y: number): Band {
  const { key, span, profile } = profileFor(project, img, row, index);
  const snapped = snapToPeak(profile, y - span.start) + span.start;
  const i = Math.round(snapped - span.start);
  const intensity = (profile[i] ?? 0) - laneFloor(profile);
  return { id: bandId(), laneKey: key, y: snapped, source: 'manual', intensity };
}

/** Which lane (if any) does an x position fall in? */
export function laneAt(project: Project, x: number, y: number, height: number) {
  for (const w of project.wells) {
    const cx = project.laneX[laneKey(w)];
    if (cx === undefined || Math.abs(x - cx) > project.laneHalfWidth) continue;
    const span = rowSpan(project, w.row, height);
    if (y >= span.top && y <= span.bottom) return w;
  }
  return undefined;
}
