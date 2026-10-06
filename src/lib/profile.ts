// 1-D intensity profiles: down a lane (to find bands) and across the gel
// (to find lanes).

import type { GrayImage } from './image';

/** Mean brightness of each pixel row in the middle of a lane, from y0 to y1. */
export function laneProfile(
  img: GrayImage,
  centerX: number,
  halfWidth: number,
  y0: number,
  y1: number,
): Float32Array {
  // use the central 60% of the lane: edges are often fuzzy or slanted
  const hw = Math.max(1, Math.round(halfWidth * 0.6));
  const x0 = Math.max(0, Math.round(centerX) - hw);
  const x1 = Math.min(img.width - 1, Math.round(centerX) + hw);
  const top = Math.max(0, Math.round(y0));
  const bottom = Math.min(img.height - 1, Math.round(y1));
  const out = new Float32Array(Math.max(0, bottom - top + 1));
  for (let y = top; y <= bottom; y++) {
    let sum = 0;
    for (let x = x0; x <= x1; x++) sum += img.data[y * img.width + x];
    out[y - top] = sum / (x1 - x0 + 1);
  }
  return out;
}

/** Mean brightness of each pixel column between y0 and y1. */
export function columnProfile(img: GrayImage, y0: number, y1: number): Float32Array {
  const top = Math.max(0, Math.round(y0));
  const bottom = Math.min(img.height - 1, Math.round(y1));
  const out = new Float32Array(img.width);
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < img.width; x++) out[x] += img.data[y * img.width + x];
  }
  const n = Math.max(1, bottom - top + 1);
  return out.map((v) => v / n);
}

export function gaussianSmooth(p: Float32Array, sigma: number): Float32Array {
  if (sigma <= 0) return p.slice();
  const r = Math.ceil(sigma * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) {
    let s = 0;
    let w = 0;
    for (let j = -r; j <= r; j++) {
      const idx = i + j;
      if (idx < 0 || idx >= p.length) continue;
      s += p[idx] * k[j + r];
      w += k[j + r];
    }
    out[i] = s / w;
  }
  return out;
}

function rolling(p: Float32Array, radius: number, pick: (a: number, b: number) => number) {
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) {
    let v = p[i];
    for (let j = Math.max(0, i - radius); j <= Math.min(p.length - 1, i + radius); j++) v = pick(v, p[j]);
    out[i] = v;
  }
  return out;
}

/** Background estimate: morphological opening removes features narrower than the window. */
export function baseline(p: Float32Array, radius: number): Float32Array {
  return gaussianSmooth(rolling(rolling(p, radius, Math.min), radius, Math.max), radius / 3);
}

export interface Peak {
  index: number; // position in the profile (sub-pixel)
  height: number; // background-corrected intensity
  prominence: number;
  brightness: number; // height above the lane's darkest parts; comparable between crowded and isolated bands
}

/** Typical background level of a lane: its 10th-percentile brightness. */
export function laneFloor(p: Float32Array) {
  const sorted = Array.from(p).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.1)] ?? 0;
}

export interface PeakOptions {
  sensitivity?: number; // 0..1, higher finds fainter bands
  minSeparation?: number; // px
  minProminence?: number; // absolute floor, for comparing many profiles on one scale
}

/** Find bands in a lane profile. */
export function findPeaks(raw: Float32Array, opts: PeakOptions = {}): Peak[] {
  const n = raw.length;
  if (n < 5) return [];
  const sensitivity = opts.sensitivity ?? 0.5;
  const minSep = opts.minSeparation ?? Math.max(3, Math.round(n / 120));

  const smooth = gaussianSmooth(raw, 1.2);
  const bg = baseline(smooth, Math.max(8, Math.round(n / 12)));
  const p = smooth.map((v, i) => Math.max(0, v - bg[i]));

  // noise from the median absolute pixel-to-pixel difference
  const diffs = Array.from({ length: n - 1 }, (_, i) => Math.abs(raw[i + 1] - raw[i])).sort((a, b) => a - b);
  const noise = (1.4826 * diffs[Math.floor(diffs.length / 2)]) / Math.SQRT2;
  const max = p.reduce((a, b) => Math.max(a, b), 0);
  const threshold = Math.max(noise * (6 - 5 * sensitivity), max * (0.12 - 0.11 * sensitivity), opts.minProminence ?? 0, 1e-4);

  const floor = laneFloor(smooth);
  const window = Math.max(minSep * 3, Math.round(n / 10));
  const candidates: Peak[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(p[i] > p[i - 1] && p[i] >= p[i + 1])) continue;
    let leftMin = p[i];
    for (let j = i - 1; j >= Math.max(0, i - window); j--) {
      if (p[j] > p[i]) break;
      leftMin = Math.min(leftMin, p[j]);
    }
    let rightMin = p[i];
    for (let j = i + 1; j <= Math.min(n - 1, i + window); j++) {
      if (p[j] > p[i]) break;
      rightMin = Math.min(rightMin, p[j]);
    }
    const prominence = p[i] - Math.max(leftMin, rightMin);
    if (prominence < threshold) continue;
    // parabolic refinement to sub-pixel position
    const denom = p[i - 1] - 2 * p[i] + p[i + 1];
    const offset = denom !== 0 ? (0.5 * (p[i - 1] - p[i + 1])) / denom : 0;
    candidates.push({
      index: i + Math.max(-0.5, Math.min(0.5, offset)),
      height: p[i],
      prominence,
      brightness: smooth[i] - floor,
    });
  }

  // keep the stronger peak when two are too close
  candidates.sort((a, b) => b.prominence - a.prominence);
  const kept: Peak[] = [];
  for (const c of candidates) {
    if (kept.every((k) => Math.abs(k.index - c.index) >= minSep)) kept.push(c);
  }
  return kept.sort((a, b) => a.index - b.index);
}

/** Move a clicked position onto the nearest brightness maximum within ±radius px. */
export function snapToPeak(profile: Float32Array, index: number, radius = 4): number {
  const s = gaussianSmooth(profile, 1);
  let best = Math.round(index);
  for (let i = Math.max(0, best - radius); i <= Math.min(s.length - 1, Math.round(index) + radius); i++) {
    if (s[i] > s[best]) best = i;
  }
  return best;
}

export interface GridRow {
  profile: Float32Array;
  empty?: boolean[]; // per well (0-based): marked empty in the well map
  ladder?: boolean[]; // per well (0-based): holds a ladder
  bandCount?: Float32Array; // per column: how many bands run down it (see bandCountProfile)
}

/**
 * For each column, how many separate bands run down it between y0 and y1.
 * A ladder lane has many; a sample lane one or two, however bright. Used to
 * find the ladder when it is much fainter than overloaded PCR products.
 */
export function bandCountProfile(img: GrayImage, y0: number, y1: number, step = 1): Float32Array {
  const out = new Float32Array(img.width);
  // one threshold for the whole row, so blank columns don't count their noise as bands
  const top = Math.max(0, Math.round(y0));
  const region = img.data.subarray(top * img.width, Math.min(img.height, Math.round(y1) + 1) * img.width);
  const sorted = Float32Array.from(region).sort();
  const range = sorted[Math.floor(sorted.length * 0.995)] - sorted[Math.floor(sorted.length * 0.5)];
  for (let x = 0; x < img.width; x += step) {
    const n = findPeaks(laneProfile(img, x, 1, y0, y1), { sensitivity: 0.5, minProminence: range * 0.06 }).length;
    for (let i = x; i < Math.min(img.width, x + step); i++) out[i] = n;
  }
  return out;
}

/**
 * Place `count` evenly spaced lanes across one or more column profiles (rows
 * from the same comb). Knowing the number of wells makes this far more robust
 * than finding lanes freely, and knowing which wells are empty settles where a
 * row starts when its ladder is faint and its last wells are unused.
 */
const LADDER_WEIGHT = 3; // one ladder lane vs many sample lanes: it needs a strong say

function zScaled(p: Float32Array) {
  const mean = p.reduce((a, b) => a + b, 0) / p.length;
  const sd = Math.sqrt(p.reduce((a, b) => a + (b - mean) ** 2, 0) / p.length) || 1;
  return p.map((v) => (v - mean) / sd);
}

export function fitLaneGrid(
  input: Float32Array | GridRow[],
  count: number,
  // refine an existing grid: keep its spacing, move the first lane at most this far
  near?: { first: number; spacing: number; maxShift: number },
): { first: number; spacing: number } {
  const rows = input instanceof Float32Array ? [{ profile: input }] : input;
  const w = rows[0].profile.length;
  if (count <= 1) {
    const s = gaussianSmooth(rows[0].profile, w / 20);
    let best = 0;
    for (let i = 0; i < w; i++) if (s[i] > s[best]) best = i;
    return { first: best, spacing: w };
  }
  const minSpacing = near?.spacing ?? w / (count * 2); // lanes should span at least half the (cropped) image
  const maxSpacing = near?.spacing ?? (w - 1) / (count - 0.2);
  // each row scaled to zero mean and unit spread, so a faint row counts as much as a bright one
  const scaled = rows.map((r) => {
    const z = zScaled(gaussianSmooth(r.profile, Math.max(1, minSpacing / 6)));
    const at = (x: number) => {
      const i = Math.floor(x);
      const t = x - i;
      return z[i] * (1 - t) + (z[Math.min(w - 1, i + 1)] ?? z[i]) * t;
    };
    const counts = r.bandCount && r.ladder?.some(Boolean) ? zScaled(gaussianSmooth(r.bandCount, Math.max(1, minSpacing / 6))) : null;
    return {
      at,
      atCount: (x: number) => (counts ? counts[Math.min(w - 1, Math.max(0, Math.round(x)))] : 0),
      sign: Array.from({ length: count }, (_, k) => (r.empty?.[k] ? -1 : 1)),
      ladder: Array.from({ length: count }, (_, k) => !!r.ladder?.[k]),
    };
  });

  let best = { first: w / (2 * count), spacing: w / count, score: -Infinity };
  for (let spacing = minSpacing; spacing <= maxSpacing; spacing += 0.5) {
    const span = spacing * (count - 1);
    const lo = near ? Math.max(0, near.first - near.maxShift) : spacing * 0.3;
    const hi = near ? Math.min(w - 1 - span, near.first + near.maxShift) : w - 1 - spacing * 0.3 - span;
    for (let first = lo; first <= hi; first += 0.5) {
      let score = 0;
      for (const { at, atCount, sign, ladder } of scaled) {
        // reward bright lane centres (dark ones for empty wells), penalise bright gaps between lanes
        for (let k = 0; k < count; k++) score += sign[k] * at(first + k * spacing);
        for (let k = 0; k < count - 1; k++) score -= at(first + (k + 0.5) * spacing);
        // ladder wells should land where many bands run down the gel
        for (let k = 0; k < count; k++) if (ladder[k]) score += LADDER_WEIGHT * atCount(first + k * spacing);
      }
      if (score > best.score) best = { first, spacing, score };
    }
  }
  return { first: best.first, spacing: best.spacing };
}
