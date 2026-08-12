import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
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
import { CvClassService, CreateClassDto, UpdateClassDto, AssignStudentToClassDto } from './cv-class.service';

@Controller('childrens-village/classes')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvClassController {
  constructor(private readonly classService: CvClassService) {}

  @Get()
  @RequirePermissions('CV:CLASS:READ')
  async findAll(@Query('academicYearId') academicYearId?: string) {
    return this.classService.findAll(academicYearId);
  }

  @Get(':id')
  @RequirePermissions('CV:CLASS:READ')
  async findById(@Param('id') id: string) {
    return this.classService.findById(id);
  }

  @Post()
  @RequirePermissions('CV:CLASS:CREATE')
  async create(@Body() dto: CreateClassDto, @Request() req: any) {
    return this.classService.create(dto, req.user.userId);
  }

  @Put(':id')
  @RequirePermissions('CV:CLASS:UPDATE')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClassDto,
    @Request() req: any,
  ) {
    return this.classService.update(id, dto, req.user.userId);
  }

  // Roster (2026-08-03) -- see AssignStudentToClassDto's doc comment in
  // cv-class.service.ts for why this didn't exist before. Reuses the
  // CV:ALLOCATION:* permissions granted in Phase 3's migration.
  @Get(':id/roster')
  @RequirePermissions('CV:ALLOCATION:READ')
  async getRoster(@Param('id') id: string) {
    return this.classService.getRoster(id);
  }

  @Post(':id/roster')
  @RequirePermissions('CV:ALLOCATION:CREATE')
  async assignStudent(
    @Param('id') id: string,
    @Body() dto: AssignStudentToClassDto,
    @Request() req: any,
  ) {
    return this.classService.assignStudent(id, dto, req.user.userId);
  }

  @Delete(':id/roster/:studentId')
  @RequirePermissions('CV:ALLOCATION:UPDATE')
  async removeStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Request() req: any,
  ) {
    await this.classService.removeStudent(id, studentId, req.user.userId);
    return { success: true };
  }
}
