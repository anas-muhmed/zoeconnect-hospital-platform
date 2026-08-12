import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto, UpdateCampaignDto } from '../dto/campaign.dto';
import { JwtAuthGuard }     from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard }     from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }    from '../../licensing/decorators/require-module.decorator';
import { CurrentUser }      from '../../../common/decorators/current-user.decorator';
import { Audit }            from '../../../common/decorators/audit.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import type { User }        from '../../users/entities/user.entity';

/** Stage B (Checkpoint B3.4) — class-level, same reasoning as LoyaltyController. */
@ApiTags('Campaigns')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('LOYALTY')
@UseInterceptors(TenantContextInterceptor)
@Controller('loyalty/campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  @RequirePermissions('LOYALTY:CAMPAIGNS:READ')
  @ApiOperation({ summary: 'List all campaigns' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.campaignService.findAll(activeOnly === 'true');
  }

  @Get('active')
  @RequirePermissions('LOYALTY:CAMPAIGNS:READ')
  @ApiOperation({ summary: 'Get campaigns currently active (date range passes now)' })
  getActive() {
    return this.campaignService.getActiveCampaigns();
  }

  @Get(':id')
  @RequirePermissions('LOYALTY:CAMPAIGNS:READ')
  @ApiOperation({ summary: 'Get campaign by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.findOne(id);
  }

  @Post()
  @RequirePermissions('LOYALTY:CAMPAIGNS:CREATE')
  @Audit({ action: 'CAMPAIGN_CREATE', module: 'LOYALTY', entityType: 'campaign' })
  @ApiOperation({ summary: 'Create a new campaign' })
  create(@Body() dto: CreateCampaignDto, @CurrentUser() actor: User) {
    return this.campaignService.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('LOYALTY:CAMPAIGNS:UPDATE')
  @Audit({ action: 'CAMPAIGN_UPDATE', module: 'LOYALTY', entityType: 'campaign' })
  @ApiOperation({ summary: 'Update campaign details' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() actor: User,
  ) {
    return this.campaignService.update(id, dto, actor.id);
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LOYALTY:CAMPAIGNS:UPDATE')
  @ApiOperation({ summary: 'Activate a campaign' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.campaignService.setActive(id, true, actor.id);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LOYALTY:CAMPAIGNS:UPDATE')
  @ApiOperation({ summary: 'Deactivate a campaign' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.campaignService.setActive(id, false, actor.id);
  }
}
