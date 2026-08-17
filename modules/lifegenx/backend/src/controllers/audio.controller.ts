import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { sendSuccess, sendError } from '../utils/responseHandler';

export async function uploadAudio(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return sendError(res, 'No audio file uploaded', 400);
    }

    const audioId = path.parse(req.file.filename).name;
    const fileName = req.file.originalname;
    const sizeInMB = (req.file.size / (1024 * 1024)).toFixed(2);
    
    // Estimate audio duration based on file size if metadata not extracted
    const estimatedSeconds = Math.max(12, Math.round(req.file.size / 30000));
    const minutes = Math.floor(estimatedSeconds / 60);
    const seconds = estimatedSeconds % 60;
    const duration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    return sendSuccess(res, {
      audioId,
      fileName,
      duration,
      size: `${sizeInMB} MB`,
      filePath: req.file.path,
      url: `/uploads/${req.file.filename}`
    }, 'Audio file uploaded successfully', 201);
  } catch (error) {
    next(error);
  }
}
