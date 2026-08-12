import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { DrugDtcService } from '../services/drug-dtc.service';
import { buildDrugIndentingContext } from '../drug-indenting-request-context';
import { DtcFinalSelectDto } from '../dto/dtc-final-select.dto';
import { CreateBlacklistedCompanyDto } from '../dto/blacklist-company.dto';

/** Drug Indenting integration (delivery phase). Ports `routes/dtc.js`. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('drug-indenting/dtc')
export class DrugDtcController {
  constructor(private readonly dtcService: DrugDtcService) {}

  @Post('final-select/:id')
  @RequirePermissions('DRUG_INDENTING:DTC:FINAL_SELECT')
  finalSelect(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DtcFinalSelectDto) {
    return this.dtcService.finalSelect(buildDrugIndentingContext(user), id, dto);
  }

  @Post('blacklist')
  @RequirePermissions('DRUG_INDENTING:BLACKLIST:MANAGE')
  createBlacklistEntry(@CurrentUser() user: User, @Body() dto: CreateBlacklistedCompanyDto) {
    return this.dtcService.createBlacklistEntry(buildDrugIndentingContext(user), dto);
  }

  @Get('blacklist')
  @RequirePermissions('DRUG_INDENTING:BLACKLIST:VIEW')
  listBlacklist(@CurrentUser() user: User) {
    return this.dtcService.listBlacklist(user.tenantId);
  }

  @Put('blacklist/:id/remove')
  @RequirePermissions('DRUG_INDENTING:BLACKLIST:MANAGE')
  removeBlacklistEntry(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.dtcService.removeBlacklistEntry(buildDrugIndentingContext(user), id);
  }
}
