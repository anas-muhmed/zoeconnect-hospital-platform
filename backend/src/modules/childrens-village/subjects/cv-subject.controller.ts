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
import { CvSubjectService, CreateSubjectDto, UpdateSubjectDto } from './cv-subject.service';
import { SubjectCategory } from './entities/cv-subject.entity';

@Controller('childrens-village/subjects')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvSubjectController {
  constructor(private readonly subjectService: CvSubjectService) {}

  @Get()
  @RequirePermissions('CV:SUBJECT:READ')
  async findAll(@Query('category') category?: SubjectCategory) {
    return this.subjectService.findAll(category);
  }

  @Get(':id')
  @RequirePermissions('CV:SUBJECT:READ')
  async findById(@Param('id') id: string) {
    return this.subjectService.findById(id);
  }

  @Post()
  @RequirePermissions('CV:SUBJECT:CREATE')
  async create(@Body() dto: CreateSubjectDto, @Request() req: any) {
    return this.subjectService.create(dto, req.user.userId);
  }

  @Put(':id')
  @RequirePermissions('CV:SUBJECT:UPDATE')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
    @Request() req: any,
  ) {
    return this.subjectService.update(id, dto, req.user.userId);
  }
}
