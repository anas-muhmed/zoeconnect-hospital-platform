import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryBillingService } from '../services/mortuary-billing.service';
import { GenerateMortuaryBillingDto } from '../dto/generate-mortuary-billing.dto';
import { buildMortuaryContext } from '../mortuary-request-context';

/** Mortuary integration (Phase 2, Stage C). Ports `billingController.js`. `@RequirePermissions()` deferred to Stage D — see Stage C report. */
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/billing')
export class MortuaryBillingController {
  constructor(private readonly billingService: MortuaryBillingService) {}

  @Get()
  findAll(@CurrentUser() user: User, @Query('status') status?: string) {
    return this.billingService.findAll(user.tenantId, status);
  }

  @Get(':id/full')
  findFull(@CurrentUser() user: User, @Param('id') id: string) {
    return this.billingService.findFull(user.tenantId, id);
  }

  @Get('body/:bodyId')
  findByBodyId(@CurrentUser() user: User, @Param('bodyId') bodyId: string) {
    return this.billingService.findByBodyId(user.tenantId, bodyId);
  }

  @Post('generate')
  generate(@CurrentUser() user: User, @Body() dto: GenerateMortuaryBillingDto) {
    return this.billingService.generate(buildMortuaryContext(user), dto);
  }

  @Post('settle')
  settle(@CurrentUser() user: User, @Body('id') id: string) {
    return this.billingService.settle(user.tenantId, id);
  }
}

/** Ports `serviceBillingRoutes.js` (`/api/mortuary/service-billing/*`). */
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/service-billing')
export class MortuaryServiceBillingController {
  constructor(private readonly billingService: MortuaryBillingService) {}

  @Get(':id/full')
  findFull(@CurrentUser() user: User, @Param('id') id: string) {
    return this.billingService.findServiceBillingFull(user.tenantId, id);
  }

  @Post('settle')
  settle(@CurrentUser() user: User, @Body('id') id: string) {
    return this.billingService.settleServiceBilling(user.tenantId, id);
  }
}
