import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryCabinAllocationsService } from '../services/mortuary-cabin-allocations.service';
import { CreateMortuaryAllocationDto, ExtendMortuaryAllocationDto } from '../dto/create-mortuary-allocation.dto';
import { buildMortuaryContext } from '../mortuary-request-context';

/** Mortuary integration (Phase 2, Stage C). Ports `allocationController.js`. `@RequirePermissions()` deferred to Stage D — see Stage C report. */
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/cabin-allocations')
export class MortuaryCabinAllocationsController {
  constructor(private readonly allocationsService: MortuaryCabinAllocationsService) {}

  @Get()
  findAll(@CurrentUser() user: User, @Query('status') status?: string) {
    return this.allocationsService.findAll(user.tenantId, status);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateMortuaryAllocationDto) {
    return this.allocationsService.create(buildMortuaryContext(user), dto);
  }

  @Put(':id/release')
  release(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.allocationsService.release(user.tenantId, id);
  }

  @Put(':id/extend')
  extend(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendMortuaryAllocationDto) {
    return this.allocationsService.extend(user.tenantId, id, dto);
  }

  @Get(':id/calculate')
  calculate(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.allocationsService.calculate(user.tenantId, id);
  }
}
