import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvClassroomService } from './cv-classroom.service';

class UpsertClassroomBodyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() roomType?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsArray() accessibilityFeatures?: string[];
  @IsOptional() @IsUUID() assignedTeacherId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class MaintenanceWindowBodyDto {
  @IsOptional() maintenanceFrom: string | null;
  @IsOptional() maintenanceTo: string | null;
  @IsOptional() @IsString() maintenanceNotes?: string | null;
}

/**
 * Timetable Management Phase 8 -- HTTP surface over `CvClassroomService`.
 * `CvClassroom` previously had no controller at all (see that service's
 * doc comment); this is purely additive.
 */
@Controller('childrens-village/classrooms')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvClassroomController {
  constructor(private readonly classroomService: CvClassroomService) {}

  @Get()
  @RequirePermissions('CV:CLASSROOM:READ')
  async findAll(@Query('includeInactive') includeInactive?: string) {
    return this.classroomService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermissions('CV:CLASSROOM:READ')
  async findOne(@Param('id') id: string) {
    return this.classroomService.findByIdOrThrow(id);
  }

  @Post()
  @RequirePermissions('CV:CLASSROOM:MANAGE')
  async create(@Body() dto: UpsertClassroomBodyDto, @Request() req: any) {
    return this.classroomService.create(req.user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('CV:CLASSROOM:MANAGE')
  async update(@Param('id') id: string, @Body() dto: UpsertClassroomBodyDto, @Request() req: any) {
    return this.classroomService.update(req.user.userId, id, dto);
  }

  @Post(':id/maintenance-window')
  @RequirePermissions('CV:CLASSROOM:MANAGE')
  async setMaintenanceWindow(@Param('id') id: string, @Body() dto: MaintenanceWindowBodyDto, @Request() req: any) {
    return this.classroomService.setMaintenanceWindow(req.user.userId, id, dto);
  }
}
