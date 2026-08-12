import { Controller, Get, Patch, Param, Body, Query, UseGuards, UseInterceptors, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import type { User } from '../../users/entities/user.entity';
import { FeedbackComplaintService } from './feedback-complaint.service';
import { UpdateComplaintDto } from '../dto/feedback-complaint.dto';

/**
 * Admin-only management of complaints raised by patients on the public
 * portal's post-submission "we're sorry, tell us more" screen (only shown
 * for low-rated submissions -- see FeedbackPublicService). There's no
 * admin "create" route: every complaint originates from a patient opting
 * in via FeedbackPublicController, never authored directly by staff.
 */
@ApiTags('Feedback Complaints')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/complaints')
export class FeedbackComplaintController {
  constructor(private readonly complaintService: FeedbackComplaintService) {}

  @Get()
  @RequirePermissions('FEEDBACK:COMPLAINT:VIEW')
  @ApiOperation({ summary: 'List complaints for the active branch (optionally filtered by status/campaign)' })
  list(
    @ActiveBranchId() branchId: string,
    @Query('status') status?: string,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.complaintService.list(branchId, status, campaignId);
  }

  @Get(':id')
  @RequirePermissions('FEEDBACK:COMPLAINT:VIEW')
  @ApiOperation({ summary: 'Get a complaint' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.complaintService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('FEEDBACK:COMPLAINT:MANAGE')
  @ApiOperation({ summary: 'Update status, assignment, or resolution notes for a complaint' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateComplaintDto, @CurrentUser() actor: User) {
    return this.complaintService.update(id, dto, actor.id);
  }
}
