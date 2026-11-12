import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { IMAGE_LIMITS, ImageError, prepareImage } from '../utils/imagePrep.js';

const make = (width, height, format = 'png', extra = {}) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })[format](extra).toBuffer();

describe('prepareImage (Sharp: validation and preparation only, no OCR)', () => {
  it('re-encodes JPG, PNG and WebP as a colour JPEG for Gemini', async () => {
    for (const format of ['jpeg', 'png', 'webp']) {
      const out = await prepareImage(await make(300, 200, format));
      assert.equal(out.mimeType, 'image/jpeg');
      const meta = await sharp(out.buffer).metadata();
      assert.equal(meta.format, 'jpeg');
      assert.equal(meta.channels, 3, 'stays in colour');
      assert.deepEqual([out.width, out.height], [300, 200]);
    }
  });
  it('shrinks very large images but never enlarges small ones', async () => {
    const big = await prepareImage(await make(4000, 1000));
    assert.equal(Math.max(big.width, big.height), IMAGE_LIMITS.maxEdge);
    const small = await prepareImage(await make(100, 80));
    assert.deepEqual([small.width, small.height], [100, 80]);
  });
  it('applies EXIF rotation and removes metadata', async () => {
    const rotated = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } }).jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'secret-owner' } } }).toBuffer();
    const out = await prepareImage(rotated);
    assert.deepEqual([out.width, out.height], [100, 200]);
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(out.buffer.includes(Buffer.from('secret-owner')), false);
  });
  it('rejects damaged data, text and unsupported formats', async () => {
    await assert.rejects(prepareImage(Buffer.from('not an image at all, just words')), (e) => e instanceof ImageError && e.code === 'INVALID_IMAGE');
    const png = await make(50, 50);
    await assert.rejects(prepareImage(png.subarray(0, 60)), ImageError);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).gif().toBuffer();
    await assert.rejects(prepareImage(gif), (e) => e.code === 'UNSUPPORTED_FILE_TYPE');
  });
  it('rejects images with too many pixels', async () => {
    const huge = await make(6000, 6000, 'png');
    await assert.rejects(prepareImage(huge), (e) => e.code === 'IMAGE_DIMENSIONS_TOO_LARGE');
  });
});
