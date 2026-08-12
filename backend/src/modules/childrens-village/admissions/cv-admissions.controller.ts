import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvAdmissionsService, CreateAdmissionDto } from './cv-admissions.service';

@Controller('childrens-village/admissions')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvAdmissionsController {
  constructor(private readonly admissionsService: CvAdmissionsService) {}

  @Post()
  @RequirePermissions('CV:ADMISSIONS:CREATE')
  async createAdmission(@Body() dto: CreateAdmissionDto, @Request() req: any) {
    return this.admissionsService.createAdmission(dto, req.user.userId);
  }

  // Only meaningful while CvSettings.requireAdmissionApproval is on -- see
  // CvAdmissionsService.transitionAdmission()'s doc comment. Gated
  // separately from CV:ADMISSIONS:CREATE since front-desk staff who create
  // admissions shouldn't necessarily be the ones approving them.
  @Patch(':id/approve')
  @RequirePermissions('CV:ADMISSIONS:APPROVE')
  async approveAdmission(@Param('id') id: string, @Request() req: any) {
    return this.admissionsService.approveAdmission(id, req.user.userId);
  }

  @Patch(':id/reject')
  @RequirePermissions('CV:ADMISSIONS:APPROVE')
  async rejectAdmission(@Param('id') id: string, @Request() req: any) {
    return this.admissionsService.rejectAdmission(id, req.user.userId);
  }
}
