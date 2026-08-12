import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { FastifyReply } from 'fastify';

@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    // These headers prevent aggressive intermediary caches (e.g. Nginx, CDNs)
    // from serving stale session/auth metadata to other users on shared networks.
    response.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.header('Pragma', 'no-cache');
    response.header('Expires', '0');

    return next.handle();
  }
}
