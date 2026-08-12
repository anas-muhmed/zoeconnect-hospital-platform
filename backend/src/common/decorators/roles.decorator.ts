import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * @Roles(...roles) — restricts a route to users with any of the specified roles.
 *
 * Usage:
 *   @Roles('SUPER_ADMIN', 'HOSPITAL_ADMIN')
 *   @Get('config')
 *   getConfig() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
