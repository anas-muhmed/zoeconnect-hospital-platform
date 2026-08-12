import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import { FeedbackAuditService } from './feedback-audit.service';

@ApiTags('Feedback Audit Log')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/audit-logs')
export class FeedbackAuditController {
  constructor(private readonly auditService: FeedbackAuditService) {}

  @Get()
  @RequirePermissions('FEEDBACK:FORM:VIEW')
  @ApiOperation({ summary: 'List recent Feedback module audit log entries for the active branch' })
  listRecent(@ActiveBranchId() branchId: string, @Query('limit') limit?: string) {
    return this.auditService.listRecent(branchId, limit ? parseInt(limit, 10) : undefined);
  }
}
