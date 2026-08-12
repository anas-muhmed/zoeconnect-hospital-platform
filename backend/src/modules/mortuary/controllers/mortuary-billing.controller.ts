import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryBillingService } from '../services/mortuary-billing.service';
import { GenerateMortuaryBillingDto } from '../dto/generate-mortuary-billing.dto';
import { buildMortuaryContext } from '../mortuary-request-context';

/**
 * Mortuary integration (Phase 2, Stage D). Ports `billingController.js`.
 * Permission matrix: see Stage D report §2/§3. `POST generate`/`settle`
 * require MORTUARY:BILLING:MANAGE — the admin-only body-dressing-charge
 * override is enforced *inside* the service via
 * `MortuaryRequestContext.canOverrideBillingCharge`
 * (MORTUARY:BILLING:OVERRIDE_CHARGE), same pattern as allocations' advance
 * override, for the same reason (a non-privileged caller can still
 * generate a bill, just not set a custom dressing charge).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/billing')
export class MortuaryBillingController {
  constructor(private readonly billingService: MortuaryBillingService) {}

  @Get()
  @RequirePermissions('MORTUARY:BILLING:READ')
  findAll(@CurrentUser() user: User, @Query('status') status?: string) {
    return this.billingService.findAll(user.tenantId, status);
  }

  @Get(':id/full')
  @RequirePermissions('MORTUARY:BILLING:READ')
  findFull(@CurrentUser() user: User, @Param('id') id: string) {
    return this.billingService.findFull(user.tenantId, id);
  }

  @Get('body/:bodyId')
  @RequirePermissions('MORTUARY:BILLING:READ')
  findByBodyId(@CurrentUser() user: User, @Param('bodyId') bodyId: string) {
    return this.billingService.findByBodyId(user.tenantId, bodyId);
  }

  @Post('generate')
  @RequirePermissions('MORTUARY:BILLING:MANAGE')
  generate(@CurrentUser() user: User, @Body() dto: GenerateMortuaryBillingDto) {
    return this.billingService.generate(buildMortuaryContext(user), dto);
  }

  @Post('settle')
  @RequirePermissions('MORTUARY:BILLING:MANAGE')
  settle(@CurrentUser() user: User, @Body('id') id: string) {
    return this.billingService.settle(user.tenantId, id);
  }
}

/** Ports `serviceBillingRoutes.js` (`/api/mortuary/service-billing/*`). Permission matrix: see Stage D report §2/§3. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/service-billing')
export class MortuaryServiceBillingController {
  constructor(private readonly billingService: MortuaryBillingService) {}

  @Get(':id/full')
  @RequirePermissions('MORTUARY:BILLING:READ')
  findFull(@CurrentUser() user: User, @Param('id') id: string) {
    return this.billingService.findServiceBillingFull(user.tenantId, id);
  }

  @Post('settle')
  @RequirePermissions('MORTUARY:BILLING:MANAGE')
  settle(@CurrentUser() user: User, @Body('id') id: string) {
    return this.billingService.settleServiceBilling(user.tenantId, id);
  }
}
