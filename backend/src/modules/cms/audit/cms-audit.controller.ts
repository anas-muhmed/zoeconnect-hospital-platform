import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId }     from '../../../common/decorators/active-branch.decorator';
import { CmsAuditService } from './cms-audit.service';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('cms/audit-logs')
export class CmsAuditController {
  constructor(private readonly auditService: CmsAuditService) {}

  @Get()
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  list(
    @ActiveBranchId() branchId: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string
  ) {
    if (entityType && entityId) {
      return this.auditService.listForEntity(entityType, entityId);
    }
    return this.auditService.listRecent(branchId);
  }
}
