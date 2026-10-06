// TIFF decoding for gel doc exports (Bio-Rad Image Lab, Analytik Jena, etc.).
// Browsers can't open TIFF, so we decode it ourselves. 16-bit greyscale is
// windowed to 8-bit using the image's own brightness range, so faint bands
// that live in the low bits aren't thrown away.

import UTIF from 'utif'

export interface DecodedImage {
  width: number
  height: number
  data: Uint8ClampedArray // RGBA
  // share of pixels at the sensor's maximum; only known for 16-bit data,
  // since 8-bit images are checked after tone settings are chosen
  saturatedFraction?: number
}

export function isTiff(file: File) {
  return /\.tiff?$/i.test(file.name) || file.type === 'image/tiff'
}

export function decodeTiff(buffer: ArrayBuffer): DecodedImage {
  const ifds = UTIF.decode(buffer)
  // first page that is a real image (some exports add a thumbnail)
  const page = ifds.find((p) => p.t256) ?? ifds[0]
  if (!page) throw new Error('No image found in this TIFF file.')
  UTIF.decodeImage(buffer, page, ifds)
  const { width, height } = page
  const bps = page.t258?.[0] ?? 8
  const photometric = page.t262?.[0] ?? 1
  const channels = page.t258?.length ?? 1

  if (bps === 16 && channels === 1 && (photometric === 0 || photometric === 1)) {
    const bytes = page.data as Uint8Array
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const n = width * height
    const raw = new Uint16Array(n)
    let saturated = 0
    for (let i = 0; i < n; i++) {
      let v = view.getUint16(i * 2, page.isLE)
      if (v >= 65500) saturated++
      if (photometric === 0) v = 65535 - v // WhiteIsZero
      raw[i] = v
    }
    // window from the 0.1th to 99.95th percentile
    const sorted = raw.slice().sort()
    const lo = sorted[Math.floor(n * 0.001)]
    const hi = Math.max(lo + 1, sorted[Math.min(n - 1, Math.floor(n * 0.9995))])
    const data = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      const g = ((raw[i] - lo) / (hi - lo)) * 255
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g
      data[i * 4 + 3] = 255
    }
    return { width, height, data, saturatedFraction: saturated / n }
  }

  return { width, height, data: new Uint8ClampedArray(UTIF.toRGBA8(page)) }
}
