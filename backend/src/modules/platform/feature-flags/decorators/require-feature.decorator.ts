import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'required_feature';

/**
 * @RequireFeature (Phase 11, Task 11.2 / spec Section 8.2).
 *
 * Sits underneath `@RequireModule()`/`LicenseGuard`, mirroring that
 * decorator's exact style (`modules/licensing/decorators/require-module.decorator.ts`).
 * Apply alongside `LicenseGuard`/`RequireFeatureGuard` in the same
 * `@UseGuards(...)` array, e.g.:
 *
 *   @UseGuards(JwtAuthGuard, PermissionsGuard, RequireFeatureGuard)
 *   @RequireFeature('cms.emergency-broadcast')
 *
 * If the controller's module is also license-gated (`@RequireModule()` +
 * `LicenseGuard` present), the module gate should run first — Nest
 * evaluates `@UseGuards()` entries left-to-right, so list `LicenseGuard`
 * before `RequireFeatureGuard` when both apply, per spec Section 8.2's
 * "module gate wins if the module itself is unlicensed" rule.
 */
export const RequireFeature = (featureKey: string) => SetMetadata(FEATURE_KEY, featureKey);
