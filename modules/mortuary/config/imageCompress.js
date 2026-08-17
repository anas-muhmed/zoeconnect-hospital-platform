import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

// Resizes/recompresses an uploaded image in place, in a background thread
// (sharp uses libvips, not the Node event loop) so it doesn't block other
// requests. Non-images (PDF/DOC/XLS) are left completely untouched - sharp
// can't process them anyway, and they're not what's bloating storage.
export async function compressImage(filePath, maxDimension) {
  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return;

  const tempPath = `${filePath}.tmp`;
  let pipeline = sharp(filePath).resize({
    width: maxDimension,
    height: maxDimension,
    fit: 'inside',
    withoutEnlargement: true,
  });

  pipeline = ext === '.png'
    ? pipeline.png({ compressionLevel: 9, quality: 80 })
    : pipeline.jpeg({ quality: 80, mozjpeg: true });

  await pipeline.toFile(tempPath);
  await fs.promises.rename(tempPath, filePath);
}
