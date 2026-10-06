// End-to-end on a synthetic gel: lanes → bands → ladder → sizes.

import { describe, expect, it } from 'vitest';
import { fitCalibration } from './calibration';
import { applyTone, looksLightBackground, toGray } from './image';
import { suggestLadderSizes } from './ladderMatch';
import { columnProfile, findPeaks, fitLaneGrid, laneProfile } from './profile';
import { EXAMPLE_SPEC, renderSyntheticGel, syntheticLaneGeometry, syntheticY, type SyntheticGelSpec } from './syntheticGel';
import { LADDERS } from '../data/ladders';

const transgen = LADDERS.find((l) => l.id === 'transgen-100bp-plus')!;

function analyse(spec: SyntheticGelSpec, bottom = spec.height - 1) {
  let gray = toGray(renderSyntheticGel(spec));
  gray = applyTone(gray, { invert: looksLightBackground(gray), contrast: 0.2 });

  const n = spec.lanes.length;
  const grid = fitLaneGrid(columnProfile(gray, spec.wellY, spec.height - 1), n);
  const halfWidth = grid.spacing * 0.35;
  const y0 = spec.wellY + 6;

  const lanes = Array.from({ length: n }, (_, k) => {
    const cx = grid.first + k * grid.spacing;
    const peaks = findPeaks(laneProfile(gray, cx, halfWidth, y0, bottom));
    return peaks.map((p) => ({ y: p.index + y0, intensity: p.height }));
  });

  const ladderSizes = suggestLadderSizes(lanes[0], transgen.bands);
  const cal = fitCalibration(
    lanes[0].flatMap((b, i) => (ladderSizes[i] ? [{ y: b.y, size: ladderSizes[i]! }] : [])),
  );
  if (!cal.ok) throw new Error(cal.error);
  return { grid, lanes, ladderSizes, cal: cal.calibration };
}

describe('synthetic gel pipeline', () => {
  it('finds lanes where they were drawn', () => {
    const { grid } = analyse(EXAMPLE_SPEC);
    const truth = syntheticLaneGeometry(EXAMPLE_SPEC);
    expect(Math.abs(grid.spacing - truth.spacing)).toBeLessThan(3);
    expect(Math.abs(grid.first - truth.first)).toBeLessThan(4);
  });

  it('finds every ladder band and labels it correctly', () => {
    const { ladderSizes } = analyse(EXAMPLE_SPEC);
    expect(ladderSizes).toEqual(transgen.bands.map((b) => b.size));
  });

  it('sizes sample bands within 5%', () => {
    const { lanes, cal } = analyse(EXAMPLE_SPEC);
    EXAMPLE_SPEC.lanes.forEach((lane, k) => {
      if (k === 0) return;
      const expected = [...(lane?.bands ?? [])].sort((a, b) => b - a);
      const found = lanes[k].map((b) => cal.predict(b.y).size);
      expect(found.length).toBe(expected.length);
      found.forEach((size, i) => expect(Math.abs(size - expected[i]) / expected[i]).toBeLessThan(0.05));
    });
  });

  it('handles dark-on-light gels and noisier photos', () => {
    const spec = { ...EXAMPLE_SPEC, darkBands: true, noise: 0.05, seed: 3 };
    const { lanes, cal } = analyse(spec);
    const size = cal.predict(lanes[1][0].y).size;
    expect(Math.abs(size - 750) / 750).toBeLessThan(0.05);
  });

  it('still labels the ladder when the smallest bands ran off the gel', () => {
    // only look down to ~250 bp: the 200 and 100 bp bands are "off the gel"
    const { lanes, ladderSizes } = analyse(EXAMPLE_SPEC, syntheticY(EXAMPLE_SPEC, 250));
    const visible = lanes[0].length;
    expect(visible).toBe(10);
    expect(ladderSizes[0]).toBe(1500);
    expect(ladderSizes[visible - 1]).toBe(transgen.bands[visible - 1].size);
  });
});
