// Gels with several rows of wells (combs): each row is sized on its own.

import { describe, expect, it } from 'vitest';
import { autoLanes, detectBands } from './detect';
import { applyTone, toGray } from './image';
import { analyse, makeWells, newProject, type Project } from './project';
import { EXAMPLE_LADDER, renderSyntheticGel, syntheticLaneGeometry, type SyntheticLane } from './syntheticGel';

/** Render one synthetic gel per row and stack them, like a multi-comb gel. */
function stackedGel(rows: (SyntheticLane | null)[][]) {
  const width = 480;
  const rowHeight = 320;
  const parts = rows.map((lanes, r) => renderSyntheticGel({ width, height: rowHeight, wellY: 30, lanes, seed: r + 1 }));
  const data = new Uint8ClampedArray(width * rowHeight * rows.length * 4);
  parts.forEach((p, r) => data.set(p.data, r * width * rowHeight * 4));
  const gray = applyTone(toGray({ width, height: rowHeight * rows.length, data }), { invert: false, contrast: 0.2 });
  return gray;
}

function run(rows: (SyntheticLane | null)[][], ladderWells: [number, number][]) {
  const img = stackedGel(rows);
  const rowWells = rows.map((r) => r.length);
  let p: Project = { ...newProject('dna'), gelPercent: '1.5', rowWells, wells: makeWells(rowWells) };
  p.wells = p.wells.map((w) =>
    ladderWells.some(([row, index]) => w.row === row && w.index === index)
      ? { ...w, role: 'ladder', ladderId: 'transgen-100bp-plus' }
      : { ...w, role: 'sample', ladderId: undefined },
  );
  // place the well lines where the synthetic wells are
  p = { ...p, rowTops: rows.map((_, r) => r * 320 + 30) };
  p = { ...p, ...autoLanes(p, img) };
  p = { ...p, bands: detectBands(p, img, 0.5) };
  return analyse(p);
}

const sizesIn = (lane: ReturnType<typeof analyse>[number]) => lane.bands.map((b) => b.estimate!.size);

describe('multi-comb gels', () => {
  it('sizes each row against its own ladder', () => {
    const results = run(
      [
        [{ ladder: EXAMPLE_LADDER, referenceSize: 500 }, { bands: [750] }, { bands: [320, 210] }],
        [{ ladder: EXAMPLE_LADDER, referenceSize: 500 }, { bands: [1100] }, { bands: [450] }],
      ],
      [
        [1, 1],
        [2, 1],
      ],
    );
    const lane = (row: number, index: number) => results.find((l) => l.well.row === row && l.well.index === index)!;
    expect(lane(2, 2).ladderKey).toBe('2-1');
    expect(lane(2, 2).borrowedFromRow).toBeUndefined();
    const check = (got: number[], want: number[]) => {
      expect(got).toHaveLength(want.length);
      got.forEach((g, i) => expect(Math.abs(g - want[i]) / want[i]).toBeLessThan(0.05));
    };
    check(sizesIn(lane(1, 2)), [750]);
    check(sizesIn(lane(1, 3)), [320, 210]);
    check(sizesIn(lane(2, 2)), [1100]);
    check(sizesIn(lane(2, 3)), [450]);
  });

  it('keeps a faint ladder lane in place when the row ends in empty wells', () => {
    // like the real gels: overloaded PCR products, a faint ladder, and a
    // second row with only a few wells used
    const ladder = { ladder: EXAMPLE_LADDER, referenceSize: 500, brightness: 0.35 };
    const sample = (size: number) => ({ bands: [size], brightness: 2.5 });
    const rows = [
      [ladder, ...Array.from({ length: 9 }, (_, k) => sample(300 + 60 * k))],
      [ladder, sample(600), sample(450), sample(800), null, null, null, null, null, null],
    ];
    const img = stackedGel(rows);
    let p: Project = { ...newProject('dna'), rowWells: [10, 10], wells: makeWells([10, 10]), rowTops: [30, 350] };
    p = { ...p, ...autoLanes(p, img) };
    const truth = syntheticLaneGeometry({ width: 480, height: 320, wellY: 30, lanes: rows[0] });
    for (const row of [1, 2]) {
      for (let index = 1; index <= 10; index++) {
        const want = truth.first + (index - 1) * truth.spacing;
        expect(Math.abs(p.laneX[`${row}-${index}`] - want)).toBeLessThan(truth.spacing * 0.2);
      }
    }
  });

  it('borrows a ladder from another row when a row has none', () => {
    const results = run(
      [
        [{ ladder: EXAMPLE_LADDER, referenceSize: 500 }, { bands: [750] }, { bands: [320] }, null],
        [{ bands: [600] }, { bands: [320, 210] }, { bands: [1000] }, null],
      ],
      [[1, 1]],
    );
    const row2 = results.filter((l) => l.well.row === 2 && l.bands.length);
    expect(row2.length).toBe(3);
    for (const lane of row2) expect(lane.borrowedFromRow).toBe(1);
    const want = [[600], [320, 210], [1000]];
    row2.forEach((lane, i) =>
      sizesIn(lane).forEach((g, j) => expect(Math.abs(g - want[i][j]) / want[i][j]).toBeLessThan(0.05)),
    );
    // borrowed sizes carry a wider range than same-row sizes
    const same = results.find((l) => l.well.row === 1 && l.well.index === 3)!.bands[0].estimate!;
    const borrowed = row2[1].bands[0].estimate!;
    expect(borrowed.errPct).toBeGreaterThan(same.errPct);
  });
});
