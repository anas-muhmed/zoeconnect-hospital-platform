import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * ExecutionMetricsInterceptor
 * Phase 2.5: Runtime Execution Platform
 * Captures latency for document-platform controllers.
 */
@Injectable()
export class ExecutionMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        const request = context.switchToHttp().getRequest();
        // In a real system, this would emit to Prometheus/Datadog or an internal MetricsService
        // console.log(`[Metrics] ${request.method} ${request.url} took ${duration}ms`);
      }),
    );
  }
}
