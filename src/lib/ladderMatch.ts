// Suggest which ladder size belongs to each detected ladder band.
// The user can always change the suggestion.

import type { LadderBand } from '../data/types';

export interface DetectedBand {
  y: number;
  intensity: number;
}

function r2(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 3) return 1;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
}

/**
 * Returns one entry per input band (same order): the suggested ladder size,
 * or undefined for bands that don't seem to belong to the ladder.
 *
 * Assumes any missing ladder bands are at the ends (largest bands unresolved
 * at the top, smallest run off the bottom), tries each way of lining the
 * detected bands up with a run of consecutive ladder sizes, and keeps the
 * one that best fits a straight semi-log line. A brighter reference band,
 * when the ladder has one, breaks ties.
 */
export function suggestLadderSizes(bands: DetectedBand[], ladder: LadderBand[]): (number | undefined)[] {
  const order = bands.map((_, i) => i).sort((a, b) => bands[a].y - bands[b].y);
  const sizes = [...ladder].sort((a, b) => b.size - a.size);
  const m = sizes.length;

  // too many bands: keep the strongest m
  let used = order;
  if (order.length > m) {
    const strongest = new Set([...order].sort((a, b) => bands[b].intensity - bands[a].intensity).slice(0, m));
    used = order.filter((i) => strongest.has(i));
  }
  const n = used.length;
  const result: (number | undefined)[] = bands.map(() => undefined);
  if (n === 0) return result;

  const ys = used.map((i) => bands[i].y);
  const brightest = used.reduce((a, b) => (bands[b].intensity > bands[a].intensity ? b : a));
  const refIndex = sizes.findIndex((s) => s.reference);

  let bestOffset = 0;
  let bestScore = -Infinity;
  for (let offset = 0; offset <= m - n; offset++) {
    let score = r2(
      ys,
      used.map((_, k) => Math.log10(sizes[offset + k].size)),
    );
    if (refIndex >= 0 && used[refIndex - offset] === brightest) score += 0.05;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  used.forEach((bandIdx, k) => {
    result[bandIdx] = sizes[bestOffset + k].size;
  });
  return result;
}
