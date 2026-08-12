import {
  Controller,
  Get,
  Post,
  Put,
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
import { CvSectionService, CreateSectionDto, UpdateSectionDto } from './cv-section.service';

@Controller('childrens-village/sections')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvSectionController {
  constructor(private readonly sectionService: CvSectionService) {}

  @Get()
  @RequirePermissions('CV:SECTION:READ')
  async findAll(@Query('classId') classId?: string) {
    return this.sectionService.findAll(classId);
  }

  @Get(':id')
  @RequirePermissions('CV:SECTION:READ')
  async findById(@Param('id') id: string) {
    return this.sectionService.findById(id);
  }

  @Post()
  @RequirePermissions('CV:SECTION:CREATE')
  async create(@Body() dto: CreateSectionDto, @Request() req: any) {
    return this.sectionService.create(dto, req.user.userId);
  }

  @Put(':id')
  @RequirePermissions('CV:SECTION:UPDATE')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
    @Request() req: any,
  ) {
    return this.sectionService.update(id, dto, req.user.userId);
  }
}
