/**
 * Identifies JPEG, PNG and WebP from the first bytes of a file ("magic numbers"), so a file's
 * name and the browser-supplied MIME type are never trusted. Returns the MIME type or null.
 * This is a quick first check; Sharp then decodes the whole image properly.
 */
export function sniffImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => buffer[index] === byte)) return 'image/png';

  // WebP is a RIFF container: "RIFF" + 4 size bytes + "WEBP"
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';

  return null;
}
