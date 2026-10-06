// Everything the user sets up for one gel, plus the analysis built from it.

import { LADDERS } from '../data/ladders';
import { DEFAULT_GEL_PERCENT, resolvingRange } from '../data/gelRanges';
import type { GelType, Ladder, Well } from '../data/types';
import { fitCalibration, type Calibration, type Estimate } from './calibration';

export interface Band {
  id: string;
  laneKey: string;
  y: number; // px in the analysis image
  source: 'auto' | 'manual';
  intensity: number;
  ladderSize?: number; // only on ladder lanes
  sizeLocked?: boolean; // ladder size picked by the user: don't auto-relabel
}

export interface Project {
  gelType: GelType;
  gelPercent: string;
  rowWells: number[]; // number of wells in each comb row, top to bottom
  wells: Well[];
  tolerancePct: number; // expected-size match window
  // geometry, in analysis-image px
  rowTops: number[]; // y of the well line for each comb row
  laneX: Record<string, number>; // lane centre per laneKey
  laneHalfWidth: number;
  bands: Band[];
}

export const laneKey = (w: Pick<Well, 'row' | 'index'>) => `${w.row}-${w.index}`;

export const rowCount = (p: Pick<Project, 'rowWells'>) => p.rowWells.length;

export function makeWells(rowWells: number[], old: Well[] = [], ladderId?: string): Well[] {
  const wells: Well[] = [];
  for (let row = 1; row <= rowWells.length; row++) {
    for (let index = 1; index <= rowWells[row - 1]; index++) {
      const prev = old.find((w) => w.row === row && w.index === index);
      wells.push(prev ?? (index === 1 ? { row, index, role: 'ladder', ladderId } : { row, index, role: 'sample' }));
    }
  }
  return wells;
}

export function newProject(gelType: GelType = 'dna'): Project {
  return {
    gelType,
    gelPercent: DEFAULT_GEL_PERCENT[gelType],
    rowWells: [8],
    wells: makeWells([8], [], LADDERS.find((l) => l.gelType === gelType)?.id),
    tolerancePct: 10,
    rowTops: [],
    laneX: {},
    laneHalfWidth: 0,
    bands: [],
  };
}

export function ladderFor(well: Well): Ladder | undefined {
  return LADDERS.find((l) => l.id === well.ladderId);
}

/** Vertical extent of a comb row's lanes: from just below its wells to the next row (or the bottom). */
export function rowSpan(project: Pick<Project, 'rowTops'>, row: number, height: number) {
  const top = project.rowTops[row - 1] ?? 0;
  const next = project.rowTops[row];
  const bottom = next !== undefined ? next - 4 : height - 1;
  // skip the wells themselves, which are often bright
  const start = top + Math.max(4, (bottom - top) * 0.02);
  return { top, start, bottom };
}

// ---------- results ----------

export interface BandResult {
  band: Band;
  estimate?: Estimate;
  outsideGelRange: boolean;
  nearNextRow: boolean; // may have run into the next comb row's wells
  matchesExpected?: number; // the expected size this band was matched to
}

export interface LaneResult {
  key: string;
  well: Well;
  bands: BandResult[];
  calibration?: Calibration; // own (ladder) or borrowed (sample)
  ladderKey?: string; // which ladder lane sized this lane
  borrowedFromRow?: number; // set when that ladder is in a different comb row
  error?: string;
  expected: { size: number; found?: BandResult }[];
  unexpected: BandResult[];
}

export function analyse(project: Project): LaneResult[] {
  const range = resolvingRange(project.gelType, project.gelPercent);
  const bandsByLane = new Map<string, Band[]>();
  for (const b of project.bands) {
    bandsByLane.set(b.laneKey, [...(bandsByLane.get(b.laneKey) ?? []), b]);
  }
  const bandsOf = (key: string) => (bandsByLane.get(key) ?? []).sort((a, b) => a.y - b.y);

  // calibrate every ladder lane
  const ladderCals = new Map<string, { cal?: Calibration; error?: string; x: number; row: number }>();
  for (const w of project.wells) {
    if (w.role !== 'ladder') continue;
    const key = laneKey(w);
    const pts = bandsOf(key).flatMap((b) => (b.ladderSize ? [{ y: b.y, size: b.ladderSize }] : []));
    const r = fitCalibration(pts);
    ladderCals.set(key, {
      cal: r.ok ? r.calibration : undefined,
      error: r.ok ? undefined : r.error,
      x: project.laneX[key] ?? 0,
      row: w.row,
    });
  }

  return project.wells
    .filter((w) => w.role !== 'empty')
    .map((well) => {
      const key = laneKey(well);
      const own = ladderCals.get(key);
      let calibration: Calibration | undefined;
      let ladderKey: string | undefined;
      let borrowedFromRow: number | undefined;
      let shift = 0; // converts this row's positions into the ladder row's
      let error: string | undefined;

      if (own) {
        calibration = own.cal;
        ladderKey = key;
        error = own.error;
      } else {
        // nearest calibrated ladder: same comb row first, then the closest row.
        // Every row runs for the same time, so distance from its own well line
        // is comparable across rows (less exact, hence the wider range).
        const x = project.laneX[key] ?? 0;
        let best: { key: string; rowGap: number; dx: number } | undefined;
        for (const [k, l] of ladderCals) {
          if (!l.cal) continue;
          const cand = { key: k, rowGap: Math.abs(l.row - well.row), dx: Math.abs(l.x - x) };
          if (!best || cand.rowGap < best.rowGap || (cand.rowGap === best.rowGap && cand.dx < best.dx)) best = cand;
        }
        if (best) {
          const ladder = ladderCals.get(best.key)!;
          ladderKey = best.key;
          calibration = ladder.cal;
          if (ladder.row !== well.row) {
            borrowedFromRow = ladder.row;
            shift = rowSpan(project, ladder.row, Infinity).top - rowSpan(project, well.row, Infinity).top;
          }
        } else {
          error = 'No calibrated ladder yet. Mark the ladder bands first.';
        }
      }

      const isLastRow = well.row >= rowCount(project);
      const span = rowSpan(project, well.row, Infinity);
      const bands: BandResult[] = bandsOf(key).map((band) => {
        let estimate = calibration?.predict(band.y + shift);
        if (estimate && borrowedFromRow) {
          const errPct = Math.min(50, estimate.errPct * 1.5 + 3);
          estimate = { ...estimate, errPct, low: estimate.size * (1 - errPct / 100), high: estimate.size * (1 + errPct / 100) };
        }
        const size = own ? band.ladderSize : estimate?.size;
        return {
          band,
          estimate,
          // ladder sizes are known, so the warning only matters for samples
          outsideGelRange: !own && !!(range && size && (size < range.min || size > range.max)),
          nearNextRow: !isLastRow && band.y > span.bottom - Math.max(6, (span.bottom - span.top) * 0.04),
        };
      });

      // match expected sizes to the closest band within tolerance (one band each)
      const taken = new Set<BandResult>();
      const expected = (own ? [] : (well.expected ?? [])).map((size) => {
        let found: BandResult | undefined;
        let bestDiff = Infinity;
        for (const br of bands) {
          if (!br.estimate || taken.has(br)) continue;
          const diff = (Math.abs(br.estimate.size - size) / size) * 100;
          if (diff <= project.tolerancePct && diff < bestDiff) {
            found = br;
            bestDiff = diff;
          }
        }
        if (found) {
          taken.add(found);
          found.matchesExpected = size;
        }
        return { size, found };
      });
      const unexpected = expected.length ? bands.filter((b) => !taken.has(b)) : [];

      return { key, well, bands, calibration, ladderKey, borrowedFromRow, error, expected, unexpected };
    });
}

export function formatSize(size: number, gelType: GelType) {
  if (gelType === 'protein') return size < 20 ? size.toFixed(1) : Math.round(size).toString();
  return Math.round(size).toLocaleString('en-US');
}

export function wellName(well: Well, rows: number) {
  // rows: how many comb rows the gel has (row numbers only shown when > 1)
  const base = rows > 1 ? `Row ${well.row} · Well ${well.index}` : `Well ${well.index}`;
  return well.label ? `${base} — ${well.label}` : base;
}
