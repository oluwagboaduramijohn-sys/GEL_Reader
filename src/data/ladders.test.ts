import { describe, expect, it } from 'vitest';
import { LADDERS } from './ladders';

describe('ladder library', () => {
  it('has unique ids', () => {
    const ids = LADDERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(LADDERS)('$id lists bands largest to smallest', (ladder) => {
    const s = ladder.bands.map((b) => b.size);
    expect(s.length).toBeGreaterThan(2);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThan(s[i - 1]);
  });

  // catches typos when copying ng values off a datasheet
  const loadNg = (l: (typeof LADDERS)[number]) => Number(l.massLoad?.match(/^([\d.]+) µg/)?.[1]) * 1000;
  it.each(LADDERS.filter((l) => loadNg(l) > 0))('$id band masses add up to $massLoad', (ladder) => {
    const total = ladder.bands.reduce((sum, b) => sum + (b.massNg ?? NaN), 0);
    expect(Math.abs(total - loadNg(ladder)) / loadNg(ladder)).toBeLessThanOrEqual(0.01);
  });
});
