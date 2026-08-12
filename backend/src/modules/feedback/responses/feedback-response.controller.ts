import { Controller, Get, Param, Query, UseGuards, UseInterceptors, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import { FeedbackResponseService } from './feedback-response.service';

/**
 * Minimal admin visibility into submissions -- lets Phase 2 be verified
 * end-to-end (QR -> public portal -> submission actually lands). Full
 * analytics dashboards/reports/complaint-diversion are later phases.
 */
@ApiTags('Feedback Responses')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/responses')
export class FeedbackResponseController {
  constructor(private readonly responseService: FeedbackResponseService) {}

  @Get()
  @RequirePermissions('FEEDBACK:RESPONSE:VIEW')
  list(@ActiveBranchId() branchId: string, @Query('formId') formId?: string, @Query('campaignId') campaignId?: string) {
    return this.responseService.list(branchId, formId, campaignId);
  }

  @Get(':id')
  @RequirePermissions('FEEDBACK:RESPONSE:VIEW')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.responseService.findOne(id);
  }
}
