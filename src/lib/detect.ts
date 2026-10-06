// Automatic lane placement and band detection, driven by the well map.

import type { GrayImage } from './image';
import { suggestLadderSizes } from './ladderMatch';
import { columnProfile, findPeaks, fitLaneGrid, laneProfile, snapToPeak } from './profile';
import { ladderFor, laneKey, type Band, type Project } from './project';

let nextId = 1;
export const bandId = () => `b${nextId++}`;

/** Vertical extent of a comb row's lanes: from just below its wells to the next row (or the bottom). */
export function rowSpan(project: Project, row: number, height: number) {
  const top = project.rowTops[row - 1] ?? 0;
  const next = project.rowTops[row];
  const bottom = next !== undefined ? next - 4 : height - 1;
  // skip the wells themselves, which are often bright
  const start = top + Math.max(4, (bottom - top) * 0.02);
  return { top, start, bottom };
}

/** Default well lines (evenly split rows) and lanes fitted to the image. */
export function autoLanes(project: Project, img: GrayImage): Pick<Project, 'rowTops' | 'laneX' | 'laneHalfWidth'> {
  const rowTops =
    project.rowTops.length === project.rows
      ? project.rowTops
      : Array.from({ length: project.rows }, (_, r) => Math.round(((r + 0.06) * img.height) / project.rows));
  const laneX: Record<string, number> = {};
  let spacing = img.width / project.wellsPerRow;
  for (let row = 1; row <= project.rows; row++) {
    const span = rowSpan({ ...project, rowTops }, row, img.height);
    const grid = fitLaneGrid(columnProfile(img, span.start, span.bottom), project.wellsPerRow);
    spacing = grid.spacing;
    for (let index = 1; index <= project.wellsPerRow; index++) {
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
      intensity: p.height,
    }));

    found.push(...bands);
  }
  return relabelLadders(project, [...kept, ...found]);
}

/** Suggest ladder sizes for every ladder lane, leaving sizes the user picked alone. */
export function relabelLadders(project: Project, bands: Band[], onlyLane?: string): Band[] {
  const out = bands.map((b) => ({ ...b }));
  for (const well of project.wells) {
    const key = laneKey(well);
    const ladder = well.role === 'ladder' ? ladderFor(well) : undefined;
    if (!ladder || (onlyLane && key !== onlyLane)) continue;
    const lane = out.filter((b) => b.laneKey === key);
    const locked = new Set(lane.filter((b) => b.sizeLocked).map((b) => b.ladderSize));
    const free = lane.filter((b) => !b.sizeLocked);
    const sizes = suggestLadderSizes(
      free,
      ladder.bands.filter((lb) => !locked.has(lb.size)),
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
  return { id: bandId(), laneKey: key, y: snapped, source: 'manual', intensity: profile[i] ?? 0 };
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
