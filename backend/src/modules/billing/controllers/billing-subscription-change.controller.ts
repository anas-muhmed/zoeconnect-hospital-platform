import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { BillingSubscriptionChangeService } from '../services/billing-subscription-change.service';
import { ModuleCatalogService } from '../services/module-catalog.service';
import { CreateSubscriptionChangeDto } from '../dto/create-subscription-change.dto';
import { SubscriptionChangeResponseDto } from '../dto/subscription-change-response.dto';

/**
 * Subscription Change Management. Tenant resolved exclusively from the
 * JWT, same as every other billing controller. Never touches
 * quote/checkout/payment -- these three endpoints are the entire surface
 * for scheduling/cancelling a deferred ADD or REMOVE against an existing
 * subscription (see BillingSubscriptionChangeService's doc comment for
 * why this is deferred-to-renewal rather than an immediate second
 * checkout).
 */
@ApiTags('Billing')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('billing/subscription/changes')
export class BillingSubscriptionChangeController {
  constructor(
    private readonly changeService: BillingSubscriptionChangeService,
    private readonly catalog: ModuleCatalogService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the tenant's subscription change history (pending, applied, and cancelled), newest first" })
  async list(@CurrentUser() actor: User): Promise<SubscriptionChangeResponseDto[]> {
    const changes = await this.changeService.listForTenant(actor.tenantId);
    return this.withModuleNames(changes);
  }

  @Post()
  @ApiOperation({ summary: 'Schedule an ADD or REMOVE for the current subscription, effective at the next renewal. No payment occurs.' })
  async create(@Body() dto: CreateSubscriptionChangeDto, @CurrentUser() actor: User): Promise<SubscriptionChangeResponseDto> {
    const change = await this.changeService.createChange(actor.tenantId, actor.id, dto.moduleCode, dto.action);
    const [dtoOut] = await this.withModuleNames([change]);
    return dtoOut;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a still-PENDING change before it takes effect' })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User): Promise<SubscriptionChangeResponseDto> {
    const change = await this.changeService.cancelChange(id, actor.tenantId);
    const [dtoOut] = await this.withModuleNames([change]);
    return dtoOut;
  }

  private async withModuleNames(changes: Awaited<ReturnType<BillingSubscriptionChangeService['listForTenant']>>): Promise<SubscriptionChangeResponseDto[]> {
    if (changes.length === 0) return [];
    const modules = await this.catalog.findByCodes(Array.from(new Set(changes.map((c) => c.moduleCode))));
    const nameByCode = new Map(modules.map((m) => [m.code, m.name]));
    return changes.map((c) => SubscriptionChangeResponseDto.from(c, nameByCode.get(c.moduleCode)));
  }
}
