import { describe, expect, it } from 'vitest';
import { bestChannel, clippedFraction, toGray } from './image';
import { decodeTiff } from './tiff';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Orange EtBr-style bands on a dark background; noise in every channel. */
function etbrPhoto(w = 120, h = 80) {
  const rand = rng(5);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const band = y % 20 < 3 && x % 30 > 5 && x % 30 < 25 ? 1 : 0;
      const i = (y * w + x) * 4;
      data[i] = 20 + band * 200 + rand() * 30;
      data[i + 1] = 20 + band * 60 + rand() * 30;
      data[i + 2] = 20 + band * 15 + rand() * 30;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

describe('colour channel', () => {
  it('picks red for orange EtBr fluorescence', () => {
    expect(bestChannel(etbrPhoto())).toBe('red');
  });

  it('keeps grey for a neutral image', () => {
    const img = etbrPhoto();
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 1] = img.data[i + 2] = img.data[i];
    expect(bestChannel(img)).toBe('gray');
  });
});

describe('overexposure', () => {
  it('counts clipped pixels at the signal end only', () => {
    const g = toGray({ width: 4, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 10, 10, 10, 255, 0, 0, 0, 255]) });
    expect(clippedFraction(g, false)).toBe(0.25); // one white pixel
    expect(clippedFraction(g, true)).toBe(0.5); // two black pixels when bands are dark
  });
});

/** Minimal uncompressed little-endian TIFF, 16-bit greyscale. */
function tiff16(w: number, h: number, pixels: number[]) {
  const entries: [number, number, number][] = [
    [256, 3, w],
    [257, 3, h],
    [258, 3, 16],
    [259, 3, 1],
    [262, 3, 1],
    [273, 4, 0], // patched below
    [277, 3, 1],
    [278, 3, h],
    [279, 4, w * h * 2],
  ];
  const ifdSize = 2 + entries.length * 12 + 4;
  const dataOffset = 8 + ifdSize;
  const buf = new ArrayBuffer(dataOffset + w * h * 2);
  const v = new DataView(buf);
  v.setUint8(0, 0x49);
  v.setUint8(1, 0x49);
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  v.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, value], k) => {
    const o = 10 + k * 12;
    v.setUint16(o, tag, true);
    v.setUint16(o + 2, type, true);
    v.setUint32(o + 4, 1, true);
    if (type === 3) v.setUint16(o + 8, value, true);
    else v.setUint32(o + 8, tag === 273 ? dataOffset : value, true);
  });
  pixels.forEach((p, i) => v.setUint16(dataOffset + i * 2, p, true));
  return buf;
}

describe('TIFF', () => {
  it('decodes 16-bit gel doc images and keeps faint detail', () => {
    // background ~1000, faint band 1400, bright band 60000, one saturated pixel
    const w = 40;
    const h = 30;
    const px = Array.from({ length: w * h }, (_, i) => {
      const y = Math.floor(i / w);
      if (i === 5) return 65535;
      if (y === 10) return 1400;
      if (y === 20) return 60000;
      return 1000;
    });
    const img = decodeTiff(tiff16(w, h, px));
    expect(img.width).toBe(w);
    expect(img.height).toBe(h);
    expect(img.saturatedFraction).toBeCloseTo(1 / (w * h), 6);
    const at = (y: number) => img.data[(y * w + 10) * 4];
    // the faint band must still be distinguishable from background after windowing
    expect(at(10)).toBeGreaterThan(at(0));
    expect(at(20)).toBeGreaterThan(at(10));
  });
});
