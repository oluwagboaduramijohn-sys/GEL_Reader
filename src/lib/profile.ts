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
}

export interface PeakOptions {
  sensitivity?: number; // 0..1, higher finds fainter bands
  minSeparation?: number; // px
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
  const threshold = Math.max(noise * (6 - 5 * sensitivity), max * (0.12 - 0.11 * sensitivity), 1e-4);

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
    candidates.push({ index: i + Math.max(-0.5, Math.min(0.5, offset)), height: p[i], prominence });
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

/**
 * Place `count` evenly spaced lanes across a column profile. Knowing the
 * number of wells makes this far more robust than finding lanes freely.
 */
export function fitLaneGrid(profile: Float32Array, count: number): { first: number; spacing: number } {
  const w = profile.length;
  if (count <= 1) {
    const s = gaussianSmooth(profile, w / 20);
    let best = 0;
    for (let i = 0; i < w; i++) if (s[i] > s[best]) best = i;
    return { first: best, spacing: w };
  }
  const minSpacing = w / (count * 2); // lanes should span at least half the (cropped) image
  const maxSpacing = (w - 1) / (count - 0.2);
  const s = gaussianSmooth(profile, Math.max(1, minSpacing / 6));
  const mean = s.reduce((a, b) => a + b, 0) / w;
  const at = (x: number) => {
    const i = Math.floor(x);
    const t = x - i;
    return s[i] * (1 - t) + (s[Math.min(w - 1, i + 1)] ?? s[i]) * t;
  };

  let best = { first: w / (2 * count), spacing: w / count, score: -Infinity };
  for (let spacing = minSpacing; spacing <= maxSpacing; spacing += 0.5) {
    const span = spacing * (count - 1);
    for (let first = spacing * 0.3; first + span <= w - 1 - spacing * 0.3; first += 0.5) {
      let score = 0;
      // reward bright lane centres, penalise bright gaps between lanes
      for (let k = 0; k < count; k++) score += at(first + k * spacing) - mean;
      for (let k = 0; k < count - 1; k++) score -= 0.5 * (at(first + (k + 0.5) * spacing) - mean);
      if (score > best.score) best = { first, spacing, score };
    }
  }
  return { first: best.first, spacing: best.spacing };
}
