// Grayscale analysis image: values 0..1, bands bright on a dark background.

export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

export type Channel = 'gray' | 'red' | 'green' | 'blue';

type RGBAImage = { width: number; height: number; data: Uint8ClampedArray };

export function toGray(img: RGBAImage, channel: Channel = 'gray'): GrayImage {
  const out = new Float32Array(img.width * img.height);
  const d = img.data;
  for (let i = 0; i < out.length; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    out[i] =
      (channel === 'red' ? r : channel === 'green' ? g : channel === 'blue' ? b : 0.2126 * r + 0.7152 * g + 0.0722 * b) /
      255;
  }
  return { width: img.width, height: img.height, data: out };
}

/**
 * Which colour channel shows the bands most clearly? EtBr fluoresces orange,
 * SYBR/GelGreen green, so one channel often has far better signal-to-noise
 * than plain grey. Score = spread between background and the brightest (or
 * darkest) features, divided by pixel-to-pixel noise.
 */
export function bestChannel(img: RGBAImage): Channel {
  let best: Channel = 'gray';
  let bestScore = -Infinity;
  for (const ch of ['gray', 'red', 'green', 'blue'] as Channel[]) {
    const g = toGray(img, ch);
    const mid = percentile(g.data, 50);
    const signal = Math.max(percentile(g.data, 99.5) - mid, mid - percentile(g.data, 0.5));
    const diffs = new Float32Array(g.data.length - 1);
    for (let i = 0; i < diffs.length; i++) diffs[i] = Math.abs(g.data[i + 1] - g.data[i]);
    const noise = percentile(diffs, 50) + 1 / 255;
    // plain grey wins ties: it's what people expect to see
    const score = (signal / noise) * (ch === 'gray' ? 1.1 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = ch;
    }
  }
  return best;
}

/** Share of pixels clipped at the signal end (white bands, or black bands when inverted). */
export function clippedFraction(gray: GrayImage, invert: boolean) {
  let n = 0;
  for (const v of gray.data) if (invert ? v <= 0.004 : v >= 0.996) n++;
  return n / gray.data.length;
}

function percentile(data: Float32Array, p: number) {
  // histogram is plenty precise for display stretching
  const bins = new Uint32Array(1024);
  for (const v of data) bins[Math.min(1023, Math.max(0, Math.floor(v * 1023)))]++;
  const target = (p / 100) * data.length;
  let acc = 0;
  for (let i = 0; i < 1024; i++) {
    acc += bins[i];
    if (acc >= target) return i / 1023;
  }
  return 1;
}

/** Light background (Coomassie, dark-on-light photos) means we should invert. */
export function looksLightBackground(gray: GrayImage) {
  return percentile(gray.data, 50) > 0.5;
}

export interface ToneSettings {
  invert: boolean;
  contrast: number; // 0..1, how hard to push the background towards black
}

/** Invert if needed and stretch so background ≈ 0 and the brightest bands ≈ 1. */
export function applyTone(gray: GrayImage, tone: ToneSettings): GrayImage {
  const src = tone.invert ? gray.data.map((v) => 1 - v) : gray.data;
  // contrast only pushes the background down; the top is left almost
  // unclipped so bright bands keep their relative brightness
  const lo = percentile(src, 1 + tone.contrast * 49);
  const hi = percentile(src, 99.97);
  const span = Math.max(hi - lo, 1e-3);
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = Math.min(1, Math.max(0, (src[i] - lo) / span));
  return { width: gray.width, height: gray.height, data: out };
}

export function grayToRGBA(gray: GrayImage): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(gray.width * gray.height * 4);
  for (let i = 0; i < gray.data.length; i++) {
    const v = gray.data[i] * 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}
