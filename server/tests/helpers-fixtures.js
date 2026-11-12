// Dependency-free test fixtures (file signatures only), shared by helpers.js and the pure tests.
export const fixtures = {
  png: (extra = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32 + extra, 1)]),
  jpeg: (extra = 0) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32 + extra, 1)]),
  webp: (extra = 0) =>
    Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('VP8 '), Buffer.alloc(32 + extra, 1)]),
  gif: () => Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40, 1)]),
  svg: () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'),
  pdf: () => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(40, 1)]),
  text: () => Buffer.from('this is plain text pretending to be a picture, long enough to pass any length check'),
  corruptPng: () => Buffer.concat([fixtures.png(), Buffer.from('CORRUPT')]),
  hugePng: () => Buffer.concat([fixtures.png(), Buffer.from('HUGEPIXELS')]),
};
