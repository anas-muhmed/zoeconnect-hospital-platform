import { SetMetadata } from '@nestjs/common';

export const MODULE_KEY = 'required_module';

/**
 * Marks an endpoint as requiring a specific licensed module.
 * Used in conjunction with LicenseGuard.
 *
 * @example
 * @RequireModule('LOYALTY')
 * @Get('accounts')
 */
export const RequireModule = (moduleCode: string) => SetMetadata(MODULE_KEY, moduleCode);
