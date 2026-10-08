// Counting wells from the photo, so the user doesn't have to (and a wrong
// count doesn't spread the lanes out across the gel).
//
// Lanes repeat across a row at the comb's spacing whether or not they have
// bands in them, so the spacing comes from how the row repeats: its
// brightness, how many bands run down each column, and the well slots
// themselves. With the spacing known, the grid is slid into line and the
// wells counted from the first lane with anything in it to the last.
// Empty wells at the end may or may not be counted, but they don't change
// well numbering.

import type { GrayImage } from './image';
import { bandCountProfile, columnProfile, gaussianSmooth } from './profile';
import { rowSpan } from './project';

export interface RowWells {
  count: number;
  first: number; // x of well 1's centre, px
  spacing: number; // px between wells
  confidence: number; // 0..1, how clearly the row repeats
  evidence?: number[]; // per lane position across the image, for tuning
}

/** Well lines evenly splitting the image, as the app assumes before the user moves them. */
export function defaultRowTops(rows: number, height: number) {
  return Array.from({ length: rows }, (_, r) => Math.round(((r + 0.06) * height) / rows));
}

const SUBHARMONIC_SHARE = 0.3;
const USED_EVIDENCE = 0.4;
const EDGE_MARGIN = 1; // lane centres closer than this many spacings to the image edge are usually the gel's edge

function highPass(p: Float32Array, sigma: number) {
  const slow = gaussianSmooth(p, sigma);
  const out = p.map((v, i) => v - slow[i]);
  const sd = Math.sqrt(out.reduce((a, b) => a + b * b, 0) / out.length) || 1;
  return out.map((v) => v / sd);
}

/** Normalised autocorrelation for lags lo..hi (index = lag). */
function autocorrelation(q: Float32Array, lo: number, hi: number) {
  const out = new Float32Array(hi + 1);
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i + lag < q.length; i++) s += q[i] * q[i + lag];
    out[lag] = s / (q.length - lag);
  }
  return out;
}

/** Autocorrelation of a row's signals, for lags up to a sixth of the width (a comb has at least 6 wells). */
function rowRepeat(signals: Float32Array[], width: number) {
  const lo = Math.max(5, Math.floor(width / 45));
  const hi = Math.floor(width / 6);
  // At each lag, the signal that repeats most clearly: averaging would let
  // signals that don't repeat (bright bands in a few lanes) drown out one that
  // does (the well slots).
  const each = signals.map((s) => autocorrelation(s, lo, hi));
  const acf = new Float32Array(hi + 1);
  for (let i = lo; i <= hi; i++) acf[i] = Math.max(...each.map((a) => a[i]));
  const peaks: number[] = [];
  for (let i = lo + 1; i < hi; i++) if (acf[i] > acf[i - 1] && acf[i] >= acf[i + 1] && acf[i] > 0) peaks.push(i);
  const interp = (a: Float32Array, lag: number) => {
    const i = Math.floor(lag);
    const t = lag - i;
    return i >= lo && i < hi ? a[i] * (1 - t) + a[i + 1] * t : -Infinity;
  };
  const at = (lag: number) => interp(acf, lag);
  // the clearest single signal: well slots can repeat when nothing else does
  const atAny = (lag: number) => Math.max(...each.map((a) => interp(a, lag)));
  return { acf, peaks, at, atAny };
}

type Repeat = ReturnType<typeof rowRepeat>;

/**
 * The lane spacing of a row. When only some lanes have bright bands the
 * pattern repeats most strongly every few lanes, so the best peak is often a
 * multiple of the spacing: take the shortest repeat that divides into it,
 * even if weaker. Other rows' spacings count as candidates too, since rows
 * from one comb share it and one row may show it far more clearly.
 */
function chooseSpacing(rep: Repeat, others: number[]) {
  const { acf, peaks, at, atAny } = rep;
  if (!peaks.length) return null;
  const best = peaks.reduce((a, b) => (acf[b] > acf[a] ? b : a));
  const divides = (p: number) => {
    const ratio = best / p;
    return Math.round(ratio) >= 1 && Math.abs(ratio - Math.round(ratio)) < 0.12;
  };
  const candidates = [
    ...peaks.map(refine(acf)).filter((p) => at(p) >= SUBHARMONIC_SHARE * acf[best]),
    // another row from the same comb found it: enough that something here repeats at it
    ...others.filter((p) => atAny(p) > 0.1),
  ].filter(divides);
  const spacing = candidates.length ? Math.min(...candidates) : refine(acf)(best);
  return { spacing, strength: Math.max(0, at(spacing)) };
}

/** Sub-pixel position of a peak in the autocorrelation. */
const refine = (acf: Float32Array) => (lag: number) => {
  const denom = acf[lag - 1] - 2 * acf[lag] + acf[lag + 1];
  return lag + (denom < 0 ? (0.5 * (acf[lag - 1] - acf[lag + 1])) / denom : 0);
};

/** Per column, a high percentile of brightness down the row: one thin band counts fully. */
function columnPeak(img: GrayImage, y0: number, y1: number) {
  const top = Math.max(0, Math.round(y0));
  const bottom = Math.min(img.height - 1, Math.round(y1));
  const n = bottom - top + 1;
  const out = new Float32Array(img.width);
  const col = new Float32Array(n);
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < n; y++) col[y] = img.data[(top + y) * img.width + x];
    col.sort();
    out[x] = col[Math.floor(n * 0.98)];
  }
  return out;
}

function clearestSlots(img: GrayImage, top: number, slow: number, width: number) {
  let best = { score: -Infinity, profile: new Float32Array(width) };
  for (let dy = -8; dy <= 8; dy += 2) {
    const y = Math.max(0, Math.min(img.height - 4, top + dy));
    const p = highPass(columnProfile(img, y - 2, y + 2), slow);
    const lo = Math.max(5, Math.floor(width / 45));
    const a = autocorrelation(p, lo, Math.floor(width / 6));
    const score = Math.max(...a.subarray(lo));
    if (score > best.score) best = { score, profile: p };
  }
  return best.profile;
}

export function countWells(
  img: GrayImage,
  rows: number,
  rowTops = defaultRowTops(rows, img.height),
  ladderInWell1: boolean[] = [], // per row, from the well map
): RowWells[] {
  const w = img.width;
  const slow = w / 12;
  const signals = Array.from({ length: rows }, (_, r) => {
    const span = rowSpan({ rowTops }, r + 1, img.height);
    return {
      brightness: highPass(columnProfile(img, span.start, span.bottom), slow),
      // products and smears sit near the top of a row, so that part shows the lanes best
      upper: highPass(columnProfile(img, span.start, span.start + (span.bottom - span.start) * 0.3), slow),
      // the brightest point down each column, so a lane with one thin band still shows
      peak: highPass(columnPeak(img, span.start, span.bottom), slow),
      // band counts don't repeat with the lanes, so they only help place the grid
      bands: highPass(bandCountProfile(img, span.start, span.bottom), slow),
      // the well slots: the line may be a few px off, so take the clearest strip nearby
      slots: clearestSlots(img, rowTops[r], slow, w),
    };
  });
  const repeats = signals.map((s) => rowRepeat([s.brightness, s.upper, s.peak, s.slots], w));
  const own = repeats.map((rep) => chooseSpacing(rep, []));
  const shared = repeats.map((rep, r) =>
    chooseSpacing(rep, own.flatMap((o, k) => (o && k !== r ? [o.spacing] : []))),
  );
  const spacings = shared;

  return signals.map((sig, r) => {
    const found = spacings[r];
    if (!found) return { count: 0, first: 0, spacing: 0, confidence: 0 };
    const { spacing, strength } = found;

    // evidence that a lane sits at x: brighter or busier than the gaps either
    // side, or a well slot that stands out (slots can be dark or bright)
    // (each signal averaged over a fifth of a lane first, so pixel noise can't pass for a lane)
    const smooth = [sig.brightness, sig.upper, sig.peak, sig.bands, sig.slots].map((p) => gaussianSmooth(p, spacing / 5));
    const [brightness, upper, peak, bands, slots] = smooth;
    const at = (p: Float32Array, x: number) => p[Math.min(w - 1, Math.max(0, Math.round(x)))];
    const evidence = (x: number) => {
      const lane = (p: Float32Array) => at(p, x) - (at(p, x - spacing / 2) + at(p, x + spacing / 2)) / 2;
      return Math.max(lane(brightness), lane(upper), lane(peak), lane(bands), Math.abs(lane(slots)));
    };

    // slide the grid to where lanes line up best
    let best = { phase: 0, score: -Infinity };
    for (let phase = 0; phase < spacing; phase += 0.5) {
      let score = 0;
      for (let x = phase; x < w; x += spacing) score += evidence(x);
      if (score > best.score) best = { phase, score };
    }

    // keep lanes from the first with clear evidence to the last, ignoring the
    // image edge (often the gel's edge) and specks cut off from the rest by
    // two or more blank lanes
    const xs: number[] = [];
    for (let x = best.phase; x < w; x += spacing) xs.push(x);
    const ev = xs.map(evidence);
    const used = ev.map((e, k) => e > USED_EVIDENCE && xs[k] > spacing * EDGE_MARGIN && xs[k] < w - spacing * EDGE_MARGIN);
    let firstUsed = used.indexOf(true);
    let lastUsed = used.lastIndexOf(true);
    if (firstUsed < 0) return { count: 0, first: 0, spacing, confidence: 0 };
    const cutOff = (k: number, dir: 1 | -1) => !used[k + dir] && !used[k + 2 * dir];
    while (lastUsed > firstUsed && cutOff(lastUsed, -1)) lastUsed = used.lastIndexOf(true, lastUsed - 1);
    while (firstUsed < lastUsed && cutOff(firstUsed, 1)) firstUsed = used.indexOf(true, firstUsed + 1);
    // a gel edge next to well 1 can look like a lane; when well 1 holds a
    // ladder, start at whichever of the first two lanes has more bands
    if (ladderInWell1[r] && used[firstUsed + 1]) {
      const busy = (k: number) => at(bands, xs[k]);
      if (busy(firstUsed + 1) > busy(firstUsed)) firstUsed++;
    }
    return {
      count: lastUsed - firstUsed + 1,
      first: xs[firstUsed],
      spacing,
      confidence: Math.min(1, strength),
      evidence: ev.map((e) => Math.round(e * 100) / 100),
    };
  });
}
