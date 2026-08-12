import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { LifeGenXConsultationsService } from '../services/lifegenx-consultations.service';
import { CreateConsultationDto } from '../dto/create-consultation.dto';

/** LifeGenX integration (delivery phase). Ports `controllers/consultation.controller.ts`. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('lifegenx/consultations')
export class LifeGenXConsultationsController {
  constructor(private readonly consultationsService: LifeGenXConsultationsService) {}

  @Post()
  @RequirePermissions('LIFEGENX:CONSULTATIONS:CREATE')
  create(@CurrentUser() user: User, @Body() dto: CreateConsultationDto) {
    return this.consultationsService.create(user.tenantId, user.id, dto);
  }

  @Get()
  @RequirePermissions('LIFEGENX:CONSULTATIONS:VIEW')
  list(
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('doctorName') doctorName?: string,
    @Query('patientName') patientName?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.consultationsService.list(user.tenantId, {
      search, doctorName, patientName, startDate, endDate,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('metrics/dashboard')
  @RequirePermissions('LIFEGENX:CONSULTATIONS:VIEW')
  metrics(@CurrentUser() user: User) {
    return this.consultationsService.dashboardMetrics(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('LIFEGENX:CONSULTATIONS:VIEW')
  findOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.consultationsService.findOne(user.tenantId, id);
  }
}
