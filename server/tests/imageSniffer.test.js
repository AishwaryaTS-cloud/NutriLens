import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sniffImageType } from '../utils/imageSniffer.js';
import { fixtures } from './helpers-fixtures.js';

describe('sniffImageType (reads the real bytes, not the name or MIME type)', () => {
  it('recognises JPEG, PNG and WebP', () => {
    assert.equal(sniffImageType(fixtures.jpeg()), 'image/jpeg');
    assert.equal(sniffImageType(fixtures.png()), 'image/png');
    assert.equal(sniffImageType(fixtures.webp()), 'image/webp');
  });

  it('rejects other image and document formats', () => {
    for (const buffer of [fixtures.gif(), fixtures.svg(), fixtures.pdf(), fixtures.text()]) {
      assert.equal(sniffImageType(buffer), null);
    }
    // TIFF, BMP and HEIC are not on the allow-list either.
    assert.equal(sniffImageType(Buffer.concat([Buffer.from('II*\0'), Buffer.alloc(20)])), null);
    assert.equal(sniffImageType(Buffer.concat([Buffer.from('BM'), Buffer.alloc(30)])), null);
    assert.equal(sniffImageType(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(20)])), null);
  });

  it('rejects RIFF files that are not WebP (for example WAV audio)', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVE'), Buffer.alloc(20)]);
    assert.equal(sniffImageType(wav), null);
  });

  it('rejects empty, tiny and non-buffer input without throwing', () => {
    for (const input of [Buffer.alloc(0), Buffer.from([0xff, 0xd8]), null, undefined, 'text', 42, {}]) {
      assert.equal(sniffImageType(input), null);
    }
  });

  it('is not fooled by a signature that appears later in the file', () => {
    assert.equal(sniffImageType(Buffer.concat([Buffer.from('xxxxxxxx'), fixtures.png()])), null);
  });
});
