import { PNG } from 'pngjs';

// RGBA screenshot → 8-bit grayscale PNG (no alpha), optionally rotated into the
// Kindle's portrait framebuffer. eips wants exactly this format.
export function toKindlePng(buffer, { rotate = 0, gamma = 1 } = {}) {
  const src = PNG.sync.read(buffer);
  const { width: w, height: h, data } = src;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, gamma));
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = lut[((data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114 + 500) / 1000) | 0];
  }
  let ow = w, oh = h, out = gray;
  if (rotate === 90 || rotate === 270) {
    ow = h; oh = w; out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = gray[y * w + x];
        if (rotate === 90) out[x * ow + (ow - 1 - y)] = v;      // clockwise
        else out[(oh - 1 - x) * ow + y] = v;                    // counter-clockwise
      }
    }
  } else if (rotate === 180) {
    out = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) out[gray.length - 1 - i] = gray[i];
  }
  const png = new PNG({ width: ow, height: oh, colorType: 0, inputColorType: 0, bitDepth: 8, inputHasAlpha: false });
  png.data = Buffer.from(out.buffer, out.byteOffset, out.byteLength);
  return PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8, inputHasAlpha: false });
}
