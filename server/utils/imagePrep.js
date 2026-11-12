/**
 * Validates an uploaded image with Sharp and prepares a clean copy for Gemini Vision.
 * Sharp is used ONLY for safety and size: it decodes the real bytes (so names and client MIME types
 * are never trusted), applies the EXIF rotation, drops metadata (such as GPS location), and caps the
 * size. The picture stays in colour and is not altered otherwise; there is no OCR step.
 * Nothing is written to disk.
 */
export const IMAGE_LIMITS = Object.freeze({
  maxInputPixels: 25_000_000, // about 5000 x 5000: bounds memory and blocks decompression bombs
  maxEdge: 2048, // longest side sent to Gemini (never enlarged)
  jpegQuality: 90,
});

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class ImageError extends Error {
  /** @param {'INVALID_IMAGE'|'UNSUPPORTED_FILE_TYPE'|'IMAGE_DIMENSIONS_TOO_LARGE'} code */
  constructor(code, message) {
    super(message);
    this.name = 'ImageError';
    this.code = code;
  }
}

let sharpPromise = null;
async function loadSharp() {
  sharpPromise ??= import('sharp').then((module) => {
    const sharp = module.default;
    sharp.cache(false);
    sharp.concurrency(1);
    return sharp;
  });
  return sharpPromise;
}

const tooLarge = () => new ImageError('IMAGE_DIMENSIONS_TOO_LARGE', 'This image has too many pixels. Use a smaller photo.');
const damaged = () => new ImageError('INVALID_IMAGE', 'This image could not be read. It may be damaged.');

/** @returns {Promise<{ buffer: Buffer, mimeType: string, width: number, height: number }>} */
export async function prepareImage(buffer, { sharpLoader = loadSharp } = {}) {
  const sharp = await sharpLoader();
  const input = { failOn: 'error', limitInputPixels: IMAGE_LIMITS.maxInputPixels, animated: false };
  let meta;
  try {
    meta = await sharp(buffer, input).metadata();
  } catch (err) {
    throw /pixel limit/i.test(String(err?.message)) ? tooLarge() : damaged();
  }
  if (!ALLOWED_FORMATS.has(meta.format)) throw new ImageError('UNSUPPORTED_FILE_TYPE', 'This file is not a JPG, PNG or WebP image.');
  if (!meta.width || !meta.height) throw damaged();
  if (meta.width * meta.height > IMAGE_LIMITS.maxInputPixels) throw tooLarge();
  try {
    const { data, info } = await sharp(buffer, input)
      .rotate() // apply the EXIF orientation, then drop the tag
      .flatten({ background: '#ffffff' })
      .resize({ width: IMAGE_LIMITS.maxEdge, height: IMAGE_LIMITS.maxEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: IMAGE_LIMITS.jpegQuality })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, mimeType: 'image/jpeg', width: info.width, height: info.height };
  } catch (err) {
    throw /pixel limit/i.test(String(err?.message)) ? tooLarge() : damaged();
  }
}
