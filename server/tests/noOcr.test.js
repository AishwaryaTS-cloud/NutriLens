import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const sources = walk(root).filter((f) => /\.(js|jsx|mjs|cjs|json)$/.test(f) && !f.endsWith('package-lock.json') && !f.endsWith('noOcr.test.js'));

describe('the old OCR engine is gone', () => {
  it('no source file imports or mentions an OCR engine', () => {
    const banned = /tesseract|paddleocr|easyocr|createWorker|traineddata|vision\.googleapis|textDetection|DOCUMENT_TEXT_DETECTION|ocrService|ocrQuality|imagePreprocessor/i;
    const hits = sources.filter((f) => banned.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f));
    assert.deepEqual(hits, []);
  });
  it('no package.json or lockfile declares an OCR dependency', () => {
    for (const file of ['package.json', 'server/package.json', 'client/package.json', 'ai/package.json', 'package-lock.json']) {
      assert.doesNotMatch(readFileSync(join(root, file), 'utf8'), /tesseract|paddleocr|easyocr|node-tesseract|ocrad|gocr/i, file);
    }
  });
  it('the old OCR files, language data and cache are removed', () => {
    for (const path of ['ai/ocr', 'eng.traineddata', '.cache', 'test-ocr-modes.mjs', 'client/src/components/OcrReview.jsx', 'server/tests/ocrService.test.js']) {
      assert.equal(existsSync(join(root, path)), false, path);
    }
  });
  it('no OCR package is installed', () => {
    for (const dir of ['node_modules', 'server/node_modules', 'client/node_modules']) {
      for (const name of ['tesseract.js', 'tesseract.js-core', 'paddleocr', 'easyocr']) assert.equal(existsSync(join(root, dir, name)), false, `${dir}/${name}`);
    }
  });
  it('the extraction route sends the image to Gemini, not to an OCR step', () => {
    const service = readFileSync(join(root, 'server/services/scanService.js'), 'utf8');
    const extractor = readFileSync(join(root, 'ai/gemini/labelExtractor.js'), 'utf8');
    assert.match(extractor, /inlineData/);
    assert.match(service, /extractor\(/);
    assert.doesNotMatch(service, /ocr/i);
  });
  it('the API key is never referenced in the client code', () => {
    const client = walk(join(root, 'client', 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.doesNotMatch(client, /GEMINI_API_KEY|generativelanguage|x-goog-api-key/);
  });
});
