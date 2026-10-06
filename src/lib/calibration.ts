// Ladder calibration: maps a band's vertical position (px) to a size.
//
// Model: monotone cubic interpolation (Fritsch–Carlson PCHIP) of log10(size)
// against position. It passes exactly through every ladder band and follows
// the curve that appears where a gel stops resolving well, which a single
// straight semi-log line cannot. Beyond the outermost ladder bands we
// extrapolate along the end segment and flag the result.
//
// Uncertainty: leave-one-out. Each ladder band is predicted from the others;
// the % error there tells us how trustworthy the curve is around that band.

export interface CalPoint {
  y: number; // position in px (larger = further down the gel)
  size: number;
}

export interface Estimate {
  size: number;
  low: number;
  high: number;
  errPct: number;
  extrapolated: boolean;
  // the ladder bands either side (for "between 700 and 800 bp" read-outs)
  above?: CalPoint;
  below?: CalPoint;
}

export interface Calibration {
  points: CalPoint[]; // sorted top to bottom
  r2: number; // straight semi-log fit quality, for reporting
  predict(y: number): Estimate;
}

export type CalibrationResult =
  | { ok: true; calibration: Calibration }
  | { ok: false; error: string };

const MIN_ERR_PCT = 2;
const DEFAULT_ERR_PCT = 10; // fewer than 3 ladder bands: no way to measure
const MAX_ERR_PCT = 50;

/** Monotone cubic interpolant through (xs, fs); xs strictly increasing. */
function pchip(xs: number[], fs: number[]) {
  const n = xs.length;
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const d = h.map((hi, i) => (fs[i + 1] - fs[i]) / hi);
  const m = new Array<number>(n);

  if (n === 2) {
    m[0] = m[1] = d[0];
  } else {
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) {
        m[i] = 0;
      } else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    m[0] = endSlope(h[0], h[1], d[0], d[1]);
    m[n - 1] = endSlope(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  }

  return (x: number): number => {
    if (x <= xs[0]) return fs[0] + d[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return fs[n - 1] + d[n - 2] * (x - xs[n - 1]);
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * fs[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * fs[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}

// Three-point end slope, kept shape-preserving (SciPy's PchipInterpolator rule).
function endSlope(h0: number, h1: number, d0: number, d1: number) {
  let m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
  if (Math.sign(m) !== Math.sign(d0)) m = 0;
  else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(m) > Math.abs(3 * d0)) m = 3 * d0;
  return m;
}

function semiLogR2(points: CalPoint[]) {
  const n = points.length;
  if (n < 3) return 1;
  const xs = points.map((p) => p.y);
  const ys = points.map((p) => Math.log10(p.size));
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

export function fitCalibration(input: CalPoint[]): CalibrationResult {
  const points = [...input].sort((a, b) => a.y - b.y);
  if (points.length < 2) {
    return { ok: false, error: 'Mark at least 2 ladder bands (3 or more is better).' };
  }
  for (let i = 1; i < points.length; i++) {
    if (points[i].y - points[i - 1].y < 1) {
      return { ok: false, error: 'Two ladder bands are at the same position.' };
    }
    if (points[i].size >= points[i - 1].size) {
      return {
        ok: false,
        error: `Ladder sizes must get smaller down the gel, but ${points[i].size} sits below ${points[i - 1].size}. Check the ladder band labels.`,
      };
    }
  }

  const xs = points.map((p) => p.y);
  const fs = points.map((p) => Math.log10(p.size));
  const curve = pchip(xs, fs);

  // Leave-one-out % error at each ladder band.
  const looErr = points.map((p, i) => {
    if (points.length < 3) return DEFAULT_ERR_PCT;
    const f = pchip(
      xs.filter((_, j) => j !== i),
      fs.filter((_, j) => j !== i),
    );
    return (Math.abs(10 ** f(p.y) - p.size) / p.size) * 100;
  });

  const n = points.length;
  const spacing = (xs[n - 1] - xs[0]) / (n - 1);

  const predict = (y: number): Estimate => {
    const size = 10 ** curve(y);
    let errPct: number;
    let extrapolated = false;
    let above: CalPoint | undefined;
    let below: CalPoint | undefined;

    if (y < xs[0] || y > xs[n - 1]) {
      extrapolated = true;
      const end = y < xs[0] ? 0 : n - 1;
      const beyond = Math.abs(y - xs[end]) / spacing;
      errPct = Math.max(looErr[end], MIN_ERR_PCT) * (1 + beyond);
      if (end === 0) below = points[0];
      else above = points[n - 1];
    } else {
      let i = 0;
      while (i < n - 2 && y > xs[i + 1]) i++;
      above = points[i];
      below = points[i + 1];
      const t = (y - xs[i]) / (xs[i + 1] - xs[i]);
      errPct = looErr[i] * (1 - t) + looErr[i + 1] * t;
    }

    errPct = Math.min(Math.max(errPct, MIN_ERR_PCT), MAX_ERR_PCT);
    return {
      size,
      low: size * (1 - errPct / 100),
      high: size * (1 + errPct / 100),
      errPct,
      extrapolated,
      above,
      below,
    };
  };

  return { ok: true, calibration: { points, r2: semiLogR2(points), predict } };
}
