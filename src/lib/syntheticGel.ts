// Draws a fake gel with known band sizes. Used for the built-in example and
// for end-to-end tests, where we know exactly what the answer should be.

export interface SyntheticLane {
  ladder?: number[]; // ladder sizes
  referenceSize?: number; // drawn twice as bright
  bands?: number[]; // sample band sizes
}

export interface SyntheticGelSpec {
  width: number;
  height: number;
  lanes: (SyntheticLane | null)[]; // null = empty well
  wellY: number;
  seed?: number;
  noise?: number; // std dev, 0..1 scale
  darkBands?: boolean; // dark-on-light, like a Coomassie gel or a photo on a white tray
}

// Migration model: slightly curved in log(size), like a real agarose gel
export function syntheticY(spec: SyntheticGelSpec, size: number) {
  const L = Math.log10(size);
  const scale = (spec.height - spec.wellY) / 440;
  return spec.wellY + (720 - 180 * L + 40 * (L - 2.7) ** 2) * scale;
}

export function syntheticLaneGeometry(spec: SyntheticGelSpec) {
  const spacing = spec.width / (spec.lanes.length + 0.5);
  return { first: spacing * 0.75, spacing, halfWidth: spacing * 0.33 };
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderSyntheticGel(spec: SyntheticGelSpec) {
  const { width, height } = spec;
  const rand = rng(spec.seed ?? 1);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const noise = spec.noise ?? 0.02;
  const { first, spacing, halfWidth } = syntheticLaneGeometry(spec);

  const v = new Float32Array(width * height);
  // background: dim with a gentle top-to-bottom gradient
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) v[y * width + x] = 0.06 + 0.04 * (y / height);
  }

  spec.lanes.forEach((lane, k) => {
    const cx = first + k * spacing;
    const bands: { size: number; amp: number }[] = [];
    if (lane?.ladder) {
      for (const size of lane.ladder) bands.push({ size, amp: size === lane.referenceSize ? 0.8 : 0.45 });
    }
    for (const size of lane?.bands ?? []) bands.push({ size, amp: 0.6 });

    for (let x = Math.floor(cx - halfWidth - 6); x <= Math.ceil(cx + halfWidth + 6); x++) {
      if (x < 0 || x >= width) continue;
      const across = 1 / (1 + Math.exp((Math.abs(x - cx) - halfWidth) / 1.5));
      // the well itself: a faint slot
      for (let y = spec.wellY - 4; y <= spec.wellY + 1; y++) {
        if (y >= 0) v[y * width + x] += 0.12 * across;
      }
      for (const b of bands) {
        const by = syntheticY(spec, b.size);
        if (by < 0 || by >= height) continue;
        const sigma = 2.2;
        for (let y = Math.floor(by - 4 * sigma); y <= Math.ceil(by + 4 * sigma); y++) {
          if (y < 0 || y >= height) continue;
          v[y * width + x] += b.amp * across * Math.exp(-((y - by) ** 2) / (2 * sigma * sigma));
        }
      }
    }
  });

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < v.length; i++) {
    let g = Math.min(1, Math.max(0, v[i] + noise * gauss()));
    if (spec.darkBands) g = 1 - g;
    // tint like a UV/blue-light transilluminator photo
    data[i * 4] = g * 235;
    data[i * 4 + 1] = g * 255;
    data[i * 4 + 2] = g * 225;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

// The built-in example: TransGen 100bp Plus ladder + PCR / genotyping samples
export const EXAMPLE_LADDER = [1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];

export const EXAMPLE_SPEC: SyntheticGelSpec = {
  width: 720,
  height: 480,
  wellY: 40,
  seed: 7,
  lanes: [
    { ladder: EXAMPLE_LADDER, referenceSize: 500 },
    { bands: [750] },
    { bands: [320, 210] },
    { bands: [320] },
    { bands: [210] },
    null,
    { bands: [1100, 450] },
    {},
  ],
};
