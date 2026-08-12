/**
 * Minimal, dependency-free image dimension reader for PNG and JPEG (the two
 * most common upload formats). Returns null for anything it doesn't
 * recognize (GIF/WEBP/BMP/TIFF/SVG) rather than pulling in an image library
 * -- width/height are a nice-to-have for the media library UI, not a hard
 * requirement, so this deliberately stays lightweight.
 */
export function readImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (isPng(buffer)) return readPngDimensions(buffer);
  if (isJpeg(buffer)) return readJpegDimensions(buffer);
  return null;
}

function isPng(buffer: Buffer): boolean {
  return buffer.length > 24 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  // IHDR chunk: bytes 16-19 = width (big-endian), 20-23 = height
  if (buffer.length < 24) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry dimensions; skip APPn/COM/etc.
    const isSofMarker = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSofMarker) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }
  return null;
}
