import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvStudentSearchService } from './services/cv-student-search.service';
import { CvStudentProfileService } from './services/cv-student-profile.service';

@Controller('childrens-village/students')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvStudentsController {
  constructor(
    private readonly searchService: CvStudentSearchService,
    private readonly profileService: CvStudentProfileService,
  ) {}

  @Get('search')
  @RequirePermissions('CV:STUDENT:READ')
  async search(@Query('q') query: string) {
    return this.searchService.search(query);
  }

  /**
   * Browse-by-default Student Directory listing (2026-08-03) -- newest
   * admissions first, optionally filtered by admissionStatus and/or a free
   * text query, paginated. Replaces the old search-only landing state.
   */
  @Get()
  @RequirePermissions('CV:STUDENT:READ')
  async list(
    @Query('q') query?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.list({
      query,
      admissionStatus: status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id/profile')
  @RequirePermissions('CV:STUDENT:READ')
  async getProfile(@Param('id') id: string) {
    return this.profileService.getStudentProfile(id);
  }
}
