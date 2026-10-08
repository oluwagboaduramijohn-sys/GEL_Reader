import { describe, expect, it } from 'vitest';
import { applyTone, toGray } from './image';
import { EXAMPLE_LADDER, renderSyntheticGel, syntheticLaneGeometry, type SyntheticLane } from './syntheticGel';
import { countWells } from './wellCount';

const ladder: SyntheticLane = { ladder: EXAMPLE_LADDER, referenceSize: 500 };
const sample = (size: number): SyntheticLane => ({ bands: [size] });

/** One synthetic gel per row, stacked; each row's lanes include a gel margin (null) either side. */
function gel(rows: (SyntheticLane | null)[][], width = 600, rowHeight = 300) {
  const parts = rows.map((lanes, r) => renderSyntheticGel({ width, height: rowHeight, wellY: 30, lanes, seed: r + 3 }));
  const data = new Uint8ClampedArray(width * rowHeight * rows.length * 4);
  parts.forEach((p, r) => data.set(p.data, r * width * rowHeight * 4));
  const img = applyTone(toGray({ width, height: rowHeight * rows.length, data }), { invert: false, contrast: 0.2 });
  const rowTops = rows.map((_, r) => r * rowHeight + 30);
  const truth = rows.map((lanes) => syntheticLaneGeometry({ width, height: rowHeight, wellY: 30, lanes }));
  return { img, rowTops, truth };
}

describe('countWells', () => {
  it('counts the wells in a row and finds well 1', () => {
    const lanes = [null, ladder, sample(700), sample(450), {}, sample(300), sample(800), sample(650), sample(500), sample(250), sample(900), null];
    const { img, rowTops, truth } = gel([lanes]);
    const [row] = countWells(img, 1, rowTops, [true]);
    expect(row.count).toBe(10);
    expect(Math.abs(row.spacing / truth[0].spacing - 1)).toBeLessThan(0.05);
    // well 1 is the ladder, in slot 1 (slot 0 is margin)
    expect(Math.abs(row.first - (truth[0].first + truth[0].spacing))).toBeLessThan(truth[0].spacing / 2);
  });

  it('gives each row its own count when the combs differ', () => {
    const wide = [null, ladder, ...[600, 450, 800, 300, 700, 500].map(sample), null];
    const narrow = [null, ladder, ...[600, 450, 800, 300, 700, 500, 650, 350, 900, 550, 750, 400].map(sample), null];
    const { img, rowTops } = gel([narrow, wide]);
    const [top, bottom] = countWells(img, 2, rowTops, [true, true]);
    expect(top.count).toBe(13);
    expect(bottom.count).toBe(7);
  });

  it('numbers wells correctly when the last wells are empty', () => {
    // blank gel after the last sample may or may not be counted as empty
    // wells; either way well 1 and every used well must be found
    const lanes = [null, ladder, sample(700), sample(450), sample(300), null, null, null, null, null];
    const { img, rowTops, truth } = gel([lanes]);
    const [row] = countWells(img, 1, rowTops, [true]);
    expect(row.count).toBeGreaterThanOrEqual(4);
    expect(Math.abs(row.spacing / truth[0].spacing - 1)).toBeLessThan(0.05);
    expect(Math.abs(row.first - (truth[0].first + truth[0].spacing))).toBeLessThan(truth[0].spacing / 2);
  });
});
