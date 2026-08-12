import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryCabinAllocationsService } from '../services/mortuary-cabin-allocations.service';
import { CreateMortuaryAllocationDto, ExtendMortuaryAllocationDto } from '../dto/create-mortuary-allocation.dto';
import { buildMortuaryContext } from '../mortuary-request-context';

/**
 * Mortuary integration (Phase 2, Stage D). Ports `allocationController.js`.
 * Permission matrix: see Stage D report §2/§3. `POST` additionally
 * requires only MORTUARY:ALLOCATIONS:CREATE — the admin-only advance-
 * amount override is enforced *inside* the service via
 * `MortuaryRequestContext.canOverrideAllocationAdvance`
 * (MORTUARY:ALLOCATIONS:OVERRIDE_ADVANCE), not as a route-level gate,
 * because a non-privileged caller is still allowed to create an
 * allocation — just not to set a custom advance amount.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/cabin-allocations')
export class MortuaryCabinAllocationsController {
  constructor(private readonly allocationsService: MortuaryCabinAllocationsService) {}

  @Get()
  @RequirePermissions('MORTUARY:ALLOCATIONS:READ')
  findAll(@CurrentUser() user: User, @Query('status') status?: string) {
    return this.allocationsService.findAll(user.tenantId, status);
  }

  @Post()
  @RequirePermissions('MORTUARY:ALLOCATIONS:CREATE')
  create(@CurrentUser() user: User, @Body() dto: CreateMortuaryAllocationDto) {
    return this.allocationsService.create(buildMortuaryContext(user), dto);
  }

  @Put(':id/release')
  @RequirePermissions('MORTUARY:ALLOCATIONS:RELEASE')
  release(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.allocationsService.release(user.tenantId, id);
  }

  @Put(':id/extend')
  @RequirePermissions('MORTUARY:ALLOCATIONS:EXTEND')
  extend(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendMortuaryAllocationDto) {
    return this.allocationsService.extend(user.tenantId, id, dto);
  }

  @Get(':id/calculate')
  @RequirePermissions('MORTUARY:ALLOCATIONS:READ')
  calculate(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.allocationsService.calculate(user.tenantId, id);
  }
}
