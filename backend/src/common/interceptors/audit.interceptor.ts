import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';

/**
 * AuditInterceptor — automatically creates audit log entries for decorated routes.
 * Enqueues the log entry asynchronously (non-blocking) after response is sent.
 * Requires AuditService to be injected.
 *
 * NOTE: Injecting AuditService directly here creates a circular dep in some setups.
 * Instead this interceptor emits an event on the global EventEmitter.
 * AuditModule listens for 'audit.log' events and writes to queue.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, context.getHandler());

    return next.handle().pipe(
      tap({
        next: () => {
          if (!meta) return;

          const request = context.switchToHttp().getRequest();
          const user = request.user;

          // Emit audit event (picked up by AuditService listener)
          const event = {
            action: meta.action,
            module: meta.module,
            entityType: meta.entityType ?? null,
            userId: user?.id ?? null,
            ipAddress: request.ip ?? request.headers['x-forwarded-for'] ?? null,
            userAgent: request.headers['user-agent'] ?? null,
            requestId: request.headers['x-request-id'] ?? null,
          };

          // Fire-and-forget via EventEmitter (avoids circular dependency)
          request.auditEvent = event;
        },
      }),
    );
  }
}
