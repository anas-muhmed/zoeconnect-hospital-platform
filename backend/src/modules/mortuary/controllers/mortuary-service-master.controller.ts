import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryServiceMasterService } from '../services/mortuary-service-master.service';
import { CreateMortuaryServiceMasterDto } from '../dto/create-mortuary-service-master.dto';

/** Mortuary integration (Phase 2, Stage C). `@RequirePermissions()` deferred to Stage D — see Stage C report. */
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/services')
export class MortuaryServiceMasterController {
  constructor(private readonly serviceMasterService: MortuaryServiceMasterService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.serviceMasterService.findAll(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateMortuaryServiceMasterDto) {
    return this.serviceMasterService.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMortuaryServiceMasterDto) {
    return this.serviceMasterService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.serviceMasterService.remove(user.tenantId, id);
    return { message: 'Service deleted successfully' };
  }
}
