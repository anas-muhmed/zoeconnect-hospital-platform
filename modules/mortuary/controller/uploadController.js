import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { compressImage } from '../config/imageCompress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Documents (scanned NOC/legal photos etc.) may need to stay legible/zoomable,
// so they get a wider cap than the logo (400px).
const DOCUMENT_MAX_DIMENSION = 1600;

export async function uploadNoc(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await compressImage(req.file.path, DOCUMENT_MAX_DIMENSION);
    res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function uploadMultiple(req, res) {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: 'No files uploaded' });

    const uploadedFiles = await Promise.all(req.files.map(async (file) => {
      await compressImage(file.path, DOCUMENT_MAX_DIMENSION);
      const { size } = fs.statSync(file.path);
      return {
        filename:     file.filename,
        originalName: file.originalname,
        path:         `/uploads/${file.filename}`,
        size,
        mimetype:     file.mimetype
      };
    }));

    res.json({ message: 'Files uploaded successfully', files: uploadedFiles });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function uploadSingle(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    await compressImage(req.file.path, DOCUMENT_MAX_DIMENSION);
    const { size } = fs.statSync(req.file.path);

    res.json({
      message: 'File uploaded successfully',
      file: {
        filename:     req.file.filename,
        originalName: req.file.originalname,
        path:         `/uploads/${req.file.filename}`,
        size,
        mimetype:     req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export function listUploads(req, res) {
  try {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) return res.json({ files: [] });

    const files = fs.readdirSync(uploadDir).map(filename => {
      const stats = fs.statSync(path.join(uploadDir, filename));
      return { filename, path: `/uploads/${filename}`, size: stats.size, createdAt: stats.birthtime };
    });

    res.json({ files });
  } catch (error) {
    console.error('Error reading uploads:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
