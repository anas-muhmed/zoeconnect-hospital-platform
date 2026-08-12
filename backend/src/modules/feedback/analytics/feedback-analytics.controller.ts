import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import { FeedbackAnalyticsService } from './feedback-analytics.service';

/**
 * Admin-only analytics dashboard -- a fixed set of aggregate views over
 * submissions/complaints (totals, rating distribution, trend, per-campaign
 * breakdown, complaint status/category). A flexible report *builder* is a
 * separate, later phase; this is deliberately just "the dashboard".
 */
@ApiTags('Feedback Analytics')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/analytics')
export class FeedbackAnalyticsController {
  constructor(private readonly analyticsService: FeedbackAnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions('FEEDBACK:ANALYTICS:VIEW')
  @ApiOperation({ summary: 'Aggregate feedback dashboard (totals, rating distribution, trend, campaign breakdown, complaint stats)' })
  getDashboard(
    @ActiveBranchId() branchId: string,
    @Query('campaignId') campaignId?: string,
    @Query('formId') formId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const days = daysRaw ? Number(daysRaw) : undefined;
    return this.analyticsService.getDashboard(branchId, { campaignId, formId, days });
  }
}
