import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { sendError } from '../utils/responseHandler';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled API Error');

  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return sendError(res, `Validation error: ${formattedErrors}`, 400, err.errors);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred on the server';

  return sendError(res, message, statusCode);
}
