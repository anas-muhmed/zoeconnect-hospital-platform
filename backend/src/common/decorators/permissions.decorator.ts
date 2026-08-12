import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * @RequirePermissions(...keys) — restricts a route to users who hold ALL specified permissions.
 * Permission key format: "MODULE:RESOURCE:ACTION"
 *
 * Usage:
 *   @RequirePermissions('LOYALTY:ACCOUNTS:CREATE')
 *   @Post('enroll')
 *   enroll() { ... }
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
