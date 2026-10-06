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
  wellsPerRow: number;
  rows: number;
  wells: Well[];
  tolerancePct: number; // expected-size match window
  // geometry, in analysis-image px
  rowTops: number[]; // y of the well line for each comb row
  laneX: Record<string, number>; // lane centre per laneKey
  laneHalfWidth: number;
  bands: Band[];
}

export const laneKey = (w: Pick<Well, 'row' | 'index'>) => `${w.row}-${w.index}`;

export function makeWells(rows: number, perRow: number, old: Well[] = [], ladderId?: string): Well[] {
  const wells: Well[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let index = 1; index <= perRow; index++) {
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
    wellsPerRow: 8,
    rows: 1,
    wells: makeWells(1, 8, [], LADDERS.find((l) => l.gelType === gelType)?.id),
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

// ---------- results ----------

export interface BandResult {
  band: Band;
  estimate?: Estimate;
  outsideGelRange: boolean;
  matchesExpected?: number; // the expected size this band was matched to
}

export interface LaneResult {
  key: string;
  well: Well;
  bands: BandResult[];
  calibration?: Calibration; // own (ladder) or borrowed (sample)
  ladderKey?: string; // which ladder lane sized this lane
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
      let error: string | undefined;

      if (own) {
        calibration = own.cal;
        ladderKey = key;
        error = own.error;
      } else {
        // nearest calibrated ladder in the same comb row
        const x = project.laneX[key] ?? 0;
        let best: [string, number] | undefined;
        for (const [k, l] of ladderCals) {
          if (l.row !== well.row || !l.cal) continue;
          const d = Math.abs(l.x - x);
          if (!best || d < best[1]) best = [k, d];
        }
        if (best) {
          ladderKey = best[0];
          calibration = ladderCals.get(best[0])!.cal;
        } else {
          error = 'No calibrated ladder in this row yet. Mark the ladder bands first.';
        }
      }

      const bands: BandResult[] = bandsOf(key).map((band) => {
        const estimate = calibration?.predict(band.y);
        const size = own ? band.ladderSize : estimate?.size;
        return {
          band,
          estimate,
          // ladder sizes are known, so the warning only matters for samples
          outsideGelRange: !own && !!(range && size && (size < range.min || size > range.max)),
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

      return { key, well, bands, calibration, ladderKey, error, expected, unexpected };
    });
}

export function formatSize(size: number, gelType: GelType) {
  if (gelType === 'protein') return size < 20 ? size.toFixed(1) : Math.round(size).toString();
  return Math.round(size).toLocaleString('en-US');
}

export function wellName(well: Well, rows: number) {
  const base = rows > 1 ? `Row ${well.row} · Well ${well.index}` : `Well ${well.index}`;
  return well.label ? `${base} — ${well.label}` : base;
}
