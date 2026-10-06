import { describe, expect, it } from 'vitest';
import { fitCalibration } from './calibration';

// Ideal semi-log gel: y = 400 - 100 * log10(size)
const ideal = [1500, 1000, 700, 500, 300, 200, 100].map((size) => ({
  size,
  y: 400 - 100 * Math.log10(size),
}));

const fit = (pts: { y: number; size: number }[]) => {
  const r = fitCalibration(pts);
  if (!r.ok) throw new Error(r.error);
  return r.calibration;
};

describe('fitCalibration', () => {
  it('passes exactly through ladder bands', () => {
    const cal = fit(ideal);
    for (const p of ideal) expect(cal.predict(p.y).size).toBeCloseTo(p.size, 6);
  });

  it('recovers sizes between ladder bands on an ideal gel', () => {
    const cal = fit(ideal);
    for (const size of [850, 420, 250, 150]) {
      const est = cal.predict(400 - 100 * Math.log10(size));
      expect(Math.abs(est.size - size) / size).toBeLessThan(0.01);
      expect(est.extrapolated).toBe(false);
      expect(est.low).toBeLessThan(size);
      expect(est.high).toBeGreaterThan(size);
    }
    expect(cal.r2).toBeCloseTo(1, 6);
  });

  it('reports the bracketing ladder bands', () => {
    const est = fit(ideal).predict(400 - 100 * Math.log10(600));
    expect(est.above?.size).toBe(700);
    expect(est.below?.size).toBe(500);
  });

  it('is monotonic: further down always means smaller', () => {
    const cal = fit(ideal);
    let prev = Infinity;
    for (let y = 70; y <= 210; y += 0.5) {
      const s = cal.predict(y).size;
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });

  it('flags extrapolation with a wider range', () => {
    const cal = fit(ideal);
    const inside = cal.predict(400 - 100 * Math.log10(400));
    const outside = cal.predict(400 - 100 * Math.log10(60));
    expect(outside.extrapolated).toBe(true);
    expect(outside.errPct).toBeGreaterThan(inside.errPct);
  });

  it('gives larger errors where the ladder is noisy', () => {
    const noisy = ideal.map((p, i) => ({ ...p, y: p.y + (i === 3 ? 6 : 0) }));
    const clean = fit(ideal).predict(ideal[3].y + 3);
    const rough = fit(noisy).predict(noisy[3].y + 3);
    expect(rough.errPct).toBeGreaterThan(clean.errPct);
  });

  it('rejects ladder labels in the wrong order', () => {
    const r = fitCalibration([
      { y: 100, size: 500 },
      { y: 150, size: 1000 },
    ]);
    expect(r.ok).toBe(false);
  });

  it('needs at least two bands', () => {
    expect(fitCalibration([{ y: 1, size: 100 }]).ok).toBe(false);
  });
});
