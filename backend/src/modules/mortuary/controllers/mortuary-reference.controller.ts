import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { MortuaryBodyTypesService } from '../services/mortuary-body-types.service';

/**
 * Mortuary integration (Phase 2, Stage C). Ports the `GET /body-types`
 * endpoint. `@RequirePermissions()`/`PermissionsGuard` deferred to Stage D
 * (see Stage C report) — `JwtAuthGuard` + `TenantContextInterceptor` are
 * wired now because `TenantScopedRepository` (used elsewhere in this
 * module) requires ambient tenant context to function at all, not as a
 * substitute for the fine-grained RBAC audit.
 */
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/body-types')
export class MortuaryReferenceController {
  constructor(private readonly bodyTypesService: MortuaryBodyTypesService) {}

  @Get()
  findAll() {
    return this.bodyTypesService.findAll();
  }
}
