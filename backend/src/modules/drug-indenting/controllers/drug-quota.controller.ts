import {
  Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { DrugQuotaService } from '../services/drug-quota.service';
import { buildDrugIndentingContext } from '../drug-indenting-request-context';
import { UpdateQuotaDto } from '../dto/update-quota.dto';

/** Drug Indenting integration (delivery phase). Ports `routes/quota.js` + `dtc.js`'s `/user-quotas`. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('drug-indenting')
export class DrugQuotaController {
  constructor(private readonly quotaService: DrugQuotaService) {}

  @Get('user/quota/:userId')
  @RequirePermissions('DRUG_INDENTING:QUOTA:VIEW')
  getOwnQuota(@CurrentUser() user: User, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.quotaService.getOwnQuota(buildDrugIndentingContext(user), userId);
  }

  @Get('dtc/user-quotas')
  @RequirePermissions('DRUG_INDENTING:QUOTA:MANAGE')
  listAllQuotas(@CurrentUser() user: User) {
    return this.quotaService.listAllQuotas(user.tenantId);
  }

  @Put('dtc/user-quotas/:userId')
  @RequirePermissions('DRUG_INDENTING:QUOTA:MANAGE')
  updateQuota(@CurrentUser() user: User, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: UpdateQuotaDto) {
    return this.quotaService.updateQuota(buildDrugIndentingContext(user), userId, dto);
  }
}
