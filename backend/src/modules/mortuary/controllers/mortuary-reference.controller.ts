import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { MortuaryBodyTypesService } from '../services/mortuary-body-types.service';

/**
 * Mortuary integration (Phase 2, Stage D). Ports the `GET /body-types`
 * endpoint. Deliberately left permission-free (authentication only): this
 * is global, static, harmless reference data (MLC/Non-MLC, Stage A/B
 * verified not tenant-scoped) every Mortuary role needs to render a
 * dropdown — gating it behind a dedicated MORTUARY:BODY_TYPES:READ
 * permission would add a permission with no real access-control value.
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
