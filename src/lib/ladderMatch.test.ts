import { describe, expect, it } from 'vitest';
import { suggestLadderSizes } from './ladderMatch';
import { syntheticY } from './syntheticGel';

const spec = { width: 400, height: 480, wellY: 40, lanes: [] };
const transgen = [1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100].map((size) => ({
  size,
  reference: size === 500,
}));
const plain = transgen.map(({ size }) => ({ size }));
const detect = (sizes: number[], bright = 500) =>
  sizes.map((s) => ({ y: syntheticY(spec, s), intensity: s === bright ? 1 : 0.5 }));

describe('suggestLadderSizes', () => {
  it('labels a complete ladder', () => {
    const sizes = transgen.map((b) => b.size);
    expect(suggestLadderSizes(detect(sizes), transgen)).toEqual(sizes);
  });

  it('copes with a band missing in the middle', () => {
    const seen = [1500, 1200, 1000, 800, 700, 600, 500, 400, 300, 200, 100]; // 900 not seen
    expect(suggestLadderSizes(detect(seen), transgen, { top: 45, bottom: 470 })).toEqual(seen);
  });

  it('copes with the smallest bands run off the gel, no reference band', () => {
    const seen = [1500, 1200, 1000, 900, 800, 700, 600, 500, 400];
    const bottom = syntheticY(spec, 350);
    expect(suggestLadderSizes(detect(seen, 0), plain, { top: 45, bottom })).toEqual(seen);
  });

  it('uses the reference band to place a partial ladder', () => {
    const seen = [700, 600, 500, 400, 300]; // only a window of the ladder visible
    expect(suggestLadderSizes(detect(seen), transgen)).toEqual(seen);
  });

  it('leaves an extra speck unlabelled', () => {
    const sizes = transgen.map((b) => b.size);
    const bands = [...detect(sizes), { y: syntheticY(spec, 545), intensity: 0.1 }];
    const labels = suggestLadderSizes(bands, transgen);
    expect(labels.slice(0, sizes.length)).toEqual(sizes);
    expect(labels[sizes.length]).toBeUndefined();
  });
});
