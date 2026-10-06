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
  it.each(LADDERS.filter((l) => l.massLoad?.startsWith('0.5 µg')))('$id band masses add up to 0.5 µg', (ladder) => {
    const total = ladder.bands.reduce((sum, b) => sum + (b.massNg ?? NaN), 0);
    expect(Math.abs(total - 500)).toBeLessThanOrEqual(5);
  });
});
