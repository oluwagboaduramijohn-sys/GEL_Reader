// Browser-side image loading, rotation and cropping (canvas based).

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Adjust {
  quarterTurns: number; // 0..3, 90° steps clockwise
  rotation: number; // fine rotation in degrees
  crop: Crop | null; // in rotated-image px
  invert: boolean;
  contrast: number; // 0..1
}

export const DEFAULT_ADJUST: Adjust = { quarterTurns: 0, rotation: 0, crop: null, invert: false, contrast: 0.2 };

const MAX_SIDE = 1600; // phone photos are huge; this is plenty for gel bands

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  return ctx;
}

export async function loadImageFile(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const c = canvas(bitmap.width * scale, bitmap.height * scale);
  ctx2d(c).drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c;
}

export function canvasFromPixels(img: { width: number; height: number; data: Uint8ClampedArray }) {
  const c = canvas(img.width, img.height);
  ctx2d(c).putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

/** Average colour of the four corners, used to fill space exposed by rotation. */
function cornerFill(src: HTMLCanvasElement) {
  const ctx = ctx2d(src);
  const pts = [
    [0, 0],
    [src.width - 1, 0],
    [0, src.height - 1],
    [src.width - 1, src.height - 1],
  ];
  const sum = [0, 0, 0];
  for (const [x, y] of pts) {
    const d = ctx.getImageData(x, y, 1, 1).data;
    for (let i = 0; i < 3; i++) sum[i] += d[i] / 4;
  }
  return `rgb(${sum.map(Math.round).join(',')})`;
}

/** The full image after rotation (before cropping). */
export function renderRotated(src: HTMLCanvasElement, adjust: Adjust): HTMLCanvasElement {
  const angle = ((adjust.quarterTurns * 90 + adjust.rotation) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const out = canvas(src.width * cos + src.height * sin, src.width * sin + src.height * cos);
  const ctx = ctx2d(out);
  ctx.fillStyle = cornerFill(src);
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(angle);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

export function cropPixels(rotated: HTMLCanvasElement, crop: Crop | null): ImageData {
  const ctx = ctx2d(rotated);
  if (!crop) return ctx.getImageData(0, 0, rotated.width, rotated.height);
  const x = Math.max(0, Math.round(crop.x));
  const y = Math.max(0, Math.round(crop.y));
  const w = Math.min(rotated.width - x, Math.round(crop.w));
  const h = Math.min(rotated.height - y, Math.round(crop.h));
  return ctx.getImageData(x, y, Math.max(1, w), Math.max(1, h));
}

export function drawPixels(target: HTMLCanvasElement, width: number, height: number, rgba: Uint8ClampedArray<ArrayBuffer>) {
  target.width = width;
  target.height = height;
  ctx2d(target).putImageData(new ImageData(rgba, width, height), 0, 0);
}
