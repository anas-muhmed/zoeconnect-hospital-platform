import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { createLogger } from '../utils/logger.util';

const logger = createLogger('GlobalExceptionFilter');

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  requestId: string;
  timestamp: string;
  path: string;
  /**
   * Optional, field-keyed hint for uniqueness-conflict errors (see
   * `global-identity-conflict.util.ts`) -- lets a form map a 409 straight
   * onto the offending input(s) (e.g. `['username']`) instead of parsing the
   * free-text `message`. Undefined for every other exception; adding this
   * is additive and doesn't change the existing response shape.
   */
  conflictFields?: string[];
}

/**
 * Catches ALL unhandled exceptions and returns a sanitised response.
 * NEVER leaks stack traces or internal details to the client.
 * Full error details are written to server logs only.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();

    const requestId = (request.headers['x-request-id'] as string) || 'unknown';
    const path = request.url;

    let statusCode: number;
    let message: string;
    let error: string;
    let conflictFields: string[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'object' && response !== null) {
        const resp = response as any;
        message = Array.isArray(resp.message)
          ? resp.message.join('; ')
          : resp.message || exception.message;
        error = resp.error || HttpStatus[statusCode];
        if (Array.isArray(resp.conflictFields)) conflictFields = resp.conflictFields;
      } else {
        message = response as string;
        error = HttpStatus[statusCode];
      }
    } else if (exception instanceof Error && exception.name === 'OptimisticLockVersionMismatchError') {
      statusCode = HttpStatus.CONFLICT;
      message = 'The record was modified by another user. Please refresh and try again.';
      error = 'Conflict';
    } else {
      // Unhandled / unexpected error — log full details, return generic 500
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An internal server error occurred. Please contact support.';
      error = 'Internal Server Error';

      logger.error('Unhandled exception', {
        requestId,
        path,
        error: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    // Log all 5xx errors at error level, 4xx at warn
    if (statusCode >= 500) {
      logger.error(`${statusCode} ${error}: ${message}`, { requestId, path });
    } else if (statusCode >= 400) {
      logger.warn(`${statusCode} ${error}: ${message}`, { requestId, path });
    }

    const responseBody: ErrorResponse = {
      statusCode,
      message,
      error,
      requestId,
      timestamp: new Date().toISOString(),
      path,
      ...(conflictFields ? { conflictFields } : {}),
    };

    reply.status(statusCode).send(responseBody);
  }
}
