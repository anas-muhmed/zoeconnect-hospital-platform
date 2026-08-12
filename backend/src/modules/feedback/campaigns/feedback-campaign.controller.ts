import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, UseInterceptors, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import type { User } from '../../users/entities/user.entity';
import { FeedbackCampaignService } from './feedback-campaign.service';
import { CreateCampaignDto, UpdateCampaignDto } from '../dto/feedback-campaign.dto';

/**
 * Admin-only CRUD for campaigns -- the named purpose (spec §14) each QR code
 * ultimately points at, e.g. "Reception Survey" or "Pharmacy Survey".
 */
@ApiTags('Feedback Campaigns')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/campaigns')
export class FeedbackCampaignController {
  constructor(private readonly campaignService: FeedbackCampaignService) {}

  @Get()
  @RequirePermissions('FEEDBACK:CAMPAIGN:VIEW')
  @ApiOperation({ summary: 'List campaigns for the active branch' })
  list(@ActiveBranchId() branchId: string) {
    return this.campaignService.list(branchId);
  }

  @Get(':id')
  @RequirePermissions('FEEDBACK:CAMPAIGN:VIEW')
  @ApiOperation({ summary: 'Get a campaign' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.findOne(id);
  }

  @Post()
  @RequirePermissions('FEEDBACK:CAMPAIGN:CREATE')
  @ApiOperation({ summary: 'Create a campaign bound to a form' })
  create(@Body() dto: CreateCampaignDto, @CurrentUser() actor: User, @ActiveBranchId() branchId: string) {
    return this.campaignService.create({ ...dto, branchId }, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('FEEDBACK:CAMPAIGN:EDIT')
  @ApiOperation({ summary: 'Update a campaign, including swapping which form it resolves to' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto, @CurrentUser() actor: User) {
    return this.campaignService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('FEEDBACK:CAMPAIGN:DELETE')
  @ApiOperation({ summary: 'Delete a campaign (must have no QR codes referencing it)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.campaignService.remove(id, actor.id);
  }
}
