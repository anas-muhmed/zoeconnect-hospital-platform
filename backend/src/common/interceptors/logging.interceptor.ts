import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest } from 'fastify';
import { createLogger } from '../utils/logger.util';

const logger = createLogger('HTTP');

/**
 * Logs every incoming request and its response time.
 * Format: METHOD /path → STATUS (Xms) [requestId]
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const { method, url } = request;
    const requestId = request.headers['x-request-id'] as string;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode: number = response.statusCode;
          const duration = Date.now() - startTime;
          logger.info(`${method} ${url} → ${statusCode} (${duration}ms)`, {
            requestId,
            method,
            url,
            statusCode,
            duration,
          });
        },
        error: () => {
          const duration = Date.now() - startTime;
          logger.warn(`${method} ${url} → ERROR (${duration}ms)`, {
            requestId,
            method,
            url,
            duration,
          });
        },
      }),
    );
  }
}
