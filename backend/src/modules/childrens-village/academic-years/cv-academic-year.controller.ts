import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
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
import { CvAcademicYearService, CreateAcademicYearDto, UpdateAcademicYearDto } from './cv-academic-year.service';

@Controller('childrens-village/academic-years')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvAcademicYearController {
  constructor(private readonly academicYearService: CvAcademicYearService) {}

  @Get()
  @RequirePermissions('CV:ACADEMIC_YEAR:READ')
  async findAll() {
    return this.academicYearService.findAll();
  }

  @Get(':id')
  @RequirePermissions('CV:ACADEMIC_YEAR:READ')
  async findById(@Param('id') id: string) {
    return this.academicYearService.findById(id);
  }

  @Post()
  @RequirePermissions('CV:ACADEMIC_YEAR:CREATE')
  async create(@Body() dto: CreateAcademicYearDto, @Request() req: any) {
    return this.academicYearService.create(dto, req.user.userId);
  }

  @Put(':id')
  @RequirePermissions('CV:ACADEMIC_YEAR:UPDATE')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAcademicYearDto,
    @Request() req: any,
  ) {
    return this.academicYearService.update(id, dto, req.user.userId);
  }
}
