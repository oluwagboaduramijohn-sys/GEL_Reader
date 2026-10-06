// Suggest which ladder size belongs to each detected ladder band.
// The user can always change the suggestion.

import type { LadderBand } from '../data/types';

export interface DetectedBand {
  y: number;
  intensity: number;
}

/** Least-squares fit of y = a + b·L (+ c·L²) where L = log10(size). */
function fitCurve(ls: number[], ys: number[]): (l: number) => number {
  const quad = ls.length >= 5;
  const cols = quad ? 3 : 2;
  // normal equations, solved by Gaussian elimination
  const A = Array.from({ length: cols }, () => new Array<number>(cols + 1).fill(0));
  for (let i = 0; i < ls.length; i++) {
    const row = [1, ls[i], ls[i] * ls[i]].slice(0, cols);
    for (let r = 0; r < cols; r++) {
      for (let c = 0; c < cols; c++) A[r][c] += row[r] * row[c];
      A[r][cols] += row[r] * ys[i];
    }
  }
  for (let c = 0; c < cols; c++) {
    let pivot = c;
    for (let r = c + 1; r < cols; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) return fitCurve(ls.slice(0, 2), ys.slice(0, 2)); // degenerate
    for (let r = 0; r < cols; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= cols; k++) A[r][k] -= f * A[c][k];
    }
  }
  const coef = A.map((row, i) => row[cols] / row[i]);
  return (l) => coef[0] + coef[1] * l + (quad ? coef[2] * l * l : 0);
}

/**
 * Monotone matching of peaks (sorted by y) to predicted ladder positions
 * (sorted by y). Every ladder band may be skipped (merged, faint, off the
 * gel); a peak may be left unmatched at a fixed cost (dust, the well itself).
 * Returns the ladder index for each peak, or -1.
 */
function matchMonotone(
  peaks: number[],
  predicted: number[],
  skipPeakCost: number,
  skipBandCost: number[],
): { map: number[]; cost: number } {
  const n = peaks.length;
  const m = predicted.length;
  // cost[i][j]: best cost using first i peaks and first j ladder bands
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  const from = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  cost[0][0] = 0;
  for (let j = 1; j <= m; j++) cost[0][j] = cost[0][j - 1] + skipBandCost[j - 1];
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      // peak i unmatched
      let best = cost[i - 1][j] + skipPeakCost;
      let how = 0;
      if (j > 0) {
        // ladder band j skipped
        if (cost[i][j - 1] + skipBandCost[j - 1] < best) {
          best = cost[i][j - 1] + skipBandCost[j - 1];
          how = 1;
        }
        // peak i ↔ ladder band j
        const d = peaks[i - 1] - predicted[j - 1];
        if (cost[i - 1][j - 1] + d * d < best) {
          best = cost[i - 1][j - 1] + d * d;
          how = 2;
        }
      }
      cost[i][j] = best;
      from[i][j] = how;
    }
  }
  const map = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0) {
    const how = from[i][j];
    if (how === 0) i--;
    else if (how === 1) j--;
    else {
      map[i - 1] = j - 1;
      i--;
      j--;
    }
  }
  return { map, cost: cost[n][m] };
}

/**
 * Returns one entry per input band (same order): the suggested ladder size,
 * or undefined for bands that don't seem to belong to the ladder.
 *
 * Try every way of lining up a run of detected bands with the ladder as a
 * starting guess, then repeatedly: fit the ladder's curve (size vs position),
 * predict where each ladder band should be, and re-match bands to the nearest
 * predictions. This copes with bands missing or merged anywhere, not just at
 * the ends. A brighter reference band, when the ladder has one, must land on
 * the brightest detected band or the suggestion is penalised.
 */
export function suggestLadderSizes(
  bands: DetectedBand[],
  ladder: LadderBand[],
  extent?: { top: number; bottom: number }, // the part of the lane that was searched
): (number | undefined)[] {
  const result: (number | undefined)[] = bands.map(() => undefined);
  const order = bands.map((_, i) => i).sort((a, b) => bands[a].y - bands[b].y);
  const sizes = [...ladder].sort((a, b) => b.size - a.size);
  const m = sizes.length;
  const n = order.length;
  if (n === 0 || m === 0) return result;

  const ys = order.map((i) => bands[i].y);
  const ls = sizes.map((s) => Math.log10(s.size));
  if (n === 1) {
    result[order[0]] = sizes[0].size;
    return result;
  }

  // The reference band (e.g. TransGen's 500 bp) is the anchor, as a person
  // would use it. Merged neighbours can look bright too, so consider the two
  // brightest bands as candidates, and only if they stand out from the rest.
  const byBrightness = order.map((_, p) => p).sort((a, b) => bands[order[b]].intensity - bands[order[a]].intensity);
  const median = bands[order[byBrightness[Math.floor(n / 2)]]].intensity;
  const refIndex = sizes.findIndex((s) => s.reference);
  const anchors = refIndex >= 0 ? byBrightness.slice(0, 2).filter((p) => bands[order[p]].intensity > median * 1.25) : [];

  const span = ys[n - 1] - ys[0];
  const top = extent?.top ?? ys[0];
  const bottom = extent?.bottom ?? ys[n - 1];
  const tooFar = (span / Math.max(n, 2)) * 0.6;
  const skipPeakCost = tooFar * tooFar;

  // starting guesses: contiguous windows, plus ones anchored on the reference band
  const starts: number[][] = [];
  const k = Math.min(n, m);
  const strongest = n > m ? new Set(byBrightness.slice(0, m)) : null;
  const use = strongest ? order.map((_, p) => p).filter((p) => strongest.has(p)) : order.map((_, p) => p);
  for (let offset = 0; offset <= m - k; offset++) {
    const map = new Array<number>(n).fill(-1);
    use.forEach((p, q) => (map[p] = offset + q));
    starts.push(map);
  }
  for (const a of anchors) {
    const map = new Array<number>(n).fill(-1);
    for (let p = 0; p < n; p++) {
      const j = refIndex + (p - a);
      if (j >= 0 && j < m) map[p] = j;
    }
    starts.push(map);
  }

  // Variants of each guess with up to two ladder bands assumed merged or
  // missing at any position (crowded tops of short gels often lose two), so
  // the refinement can start near gap-in-the-middle answers.
  const pivot = (map: number[]) => anchors.find((p) => map[p] === refIndex) ?? Math.floor(n / 2);
  const withGap = (base: number[], c: number, k: number) =>
    base.map((j, p) => {
      if (j < 0) return j;
      const moved = k < c ? (p <= k ? j - 1 : j) : p >= k ? j + 1 : j;
      return moved >= 0 && moved < m ? moved : -1;
    });
  const seen = new Set(starts.map((s) => s.join()));
  let frontier = starts.map((map) => ({ map, c: pivot(map) }));
  for (let depth = 0; depth < 2; depth++) {
    const next: typeof frontier = [];
    for (const { map, c } of frontier) {
      for (let k = 0; k < n; k++) {
        if (k === c) continue;
        const v = withGap(map, c, k);
        const key = v.join();
        if (seen.has(key)) continue;
        seen.add(key);
        starts.push(v);
        next.push({ map: v, c });
      }
    }
    frontier = next;
  }

  let best: { map: number[]; score: number } | undefined;
  for (const start of starts) {
    let map = start;
    let score = Infinity;
    for (let iter = 0; iter < 8; iter++) {
      const pairs = map.flatMap((j, p) => (j >= 0 ? [[ls[j], ys[p]]] : []));
      if (pairs.length < 2) break;
      const curve = fitCurve(
        pairs.map((q) => q[0]),
        pairs.map((q) => q[1]),
      );
      const predicted = ls.map(curve);
      // a fit that runs the wrong way (big bands below small ones) is nonsense
      if (predicted[m - 1] <= predicted[0]) break;
      // A ladder band predicted inside the visible lane but not seen is
      // suspicious, unless it's crowded against a neighbour (merged bands).
      const gaps = predicted.slice(1).map((q, j) => q - predicted[j]);
      const typicalGap = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
      const skipBandCost = predicted.map((q, j) => {
        if (q < top || q > bottom) return 0;
        const nearest = Math.min(gaps[j - 1] ?? Infinity, gaps[j] ?? Infinity);
        return nearest < typicalGap * 0.6 ? skipPeakCost * 0.05 : skipPeakCost * 0.5;
      });
      const next = matchMonotone(ys, predicted, skipPeakCost, skipBandCost);
      score = next.cost;
      if (anchors.length && !anchors.some((a) => next.map[a] === refIndex)) score += skipPeakCost * 4;
      const same = next.map.every((j, p) => j === map[p]);
      map = next.map;
      if (same) break;
    }
    if (!best || score < best.score) best = { map, score };
  }

  best?.map.forEach((j, p) => {
    if (j >= 0) result[order[p]] = sizes[j].size;
  });
  return result;
}
