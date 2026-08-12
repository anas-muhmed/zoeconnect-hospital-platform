import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action: string;
  module: string;
  entityType?: string;
}

/**
 * @Audit(meta) — marks a route for automatic audit logging via AuditInterceptor.
 *
 * Usage:
 *   @Audit({ action: 'LOGIN', module: 'AUTH' })
 *   @Post('login')
 *   login() { ... }
 */
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);
