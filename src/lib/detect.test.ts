// Band detection ignores what lies below the ladder, so noise (the gel's
// edge, smudges) is neither sized nor used for calibration.

import { describe, expect, it } from 'vitest';
import { LADDERS } from '../data/ladders';
import { autoLanes, detectBands } from './detect';
import { applyTone, toGray } from './image';
import { makeWells, newProject, type Project } from './project';
import { renderSyntheticGel, type SyntheticLane } from './syntheticGel';

const GENERULER_1KB = LADDERS.find((l) => l.id === 'generuler-1kb')!;
const ALL = GENERULER_1KB.bands.map((b) => b.size); // 10000 ... 250

function detect(lanes: SyntheticLane[]) {
  const spec = { width: 360, height: 440, wellY: 30, lanes, seed: 5 };
  const img = applyTone(toGray(renderSyntheticGel(spec)), { invert: false, contrast: 0.2 });
  let p: Project = { ...newProject('dna'), rowWells: [lanes.length], wells: makeWells([lanes.length], [], GENERULER_1KB.id) };
  p = { ...p, rowTops: [30] };
  p = { ...p, ...autoLanes(p, img) };
  return detectBands(p, img, 0.5);
}

const inLane = (bands: ReturnType<typeof detect>, key: string) => bands.filter((b) => b.laneKey === key);

describe('bands below the ladder', () => {
  it('drops sample bands below the smallest ladder band', () => {
    const bands = detect([{ ladder: ALL, referenceSize: 3000 }, { bands: [700] }, { bands: [700, 150] }]);
    expect(inLane(bands, '1-2')).toHaveLength(1);
    expect(inLane(bands, '1-3')).toHaveLength(1); // the 150 bp band lies below 250 bp
  });

  it("doesn't label a stray spot far below the ladder as its smallest bands", () => {
    // the ladder ran only down to 1000 bp; a speck sits where 250 bp would be
    const ladder = ALL.filter((s) => s >= 1000);
    const bands = detect([{ ladder: [...ladder, 250], referenceSize: 3000 }, { bands: [2000] }, { bands: [400] }]);
    const sizes = inLane(bands, '1-1').map((b) => b.ladderSize);
    expect(sizes).not.toContain(250);
    expect(Math.min(...sizes.filter((s): s is number => !!s))).toBe(1000);
    // 400 bp is still inside the ladder's range (it goes down to 250 bp), so it stays
    expect(inLane(bands, '1-3')).toHaveLength(1);
  });

  it('keeps bands inside the ladder range when its smallest fragments were too faint to find', () => {
    // the ladder ran only down to 1000 bp, but GeneRuler goes to 250 bp:
    // the curve puts 250 bp further down, so a 400 bp band is kept and a
    // band below where 250 bp would be is dropped
    const ladder = ALL.filter((s) => s >= 1000);
    const bands = detect([{ ladder, referenceSize: 3000 }, { bands: [400] }, { bands: [700, 120] }]);
    expect(inLane(bands, '1-2')).toHaveLength(1);
    expect(inLane(bands, '1-3')).toHaveLength(1);
  });
});
