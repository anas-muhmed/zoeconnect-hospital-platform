import {
  Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryBodiesService } from '../services/mortuary-bodies.service';
import { CreateMortuaryBodyDto, UpdateMortuaryBodyDto } from '../dto/create-mortuary-body.dto';

/** Mortuary integration (Phase 2, Stage C). Ports `bodyController.js`'s body endpoints. `@RequirePermissions()` deferred to Stage D — see Stage C report. */
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/bodies')
export class MortuaryBodiesController {
  constructor(private readonly bodiesService: MortuaryBodiesService) {}

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('bodyType') bodyType?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bodiesService.findAll(user.tenantId, {
      status,
      bodyType,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  async findById(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const body = await this.bodiesService.findById(user.tenantId, id);
    const [allocation, billing] = await Promise.all([
      this.bodiesService.findLatestAllocation(user.tenantId, id),
      this.bodiesService.findBilling(user.tenantId, id),
    ]);
    return { ...body, allocation, billing };
  }

  @Get(':id/allocation')
  async findAllocation(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const allocation = await this.bodiesService.findLatestAllocation(user.tenantId, id);
    if (!allocation) throw new NotFoundException('No allocation found for this body');
    return allocation;
  }

  @Get(':bodyId/mlc-registration')
  getMlcRegistration(@CurrentUser() user: User, @Param('bodyId', ParseUUIDPipe) bodyId: string) {
    return this.bodiesService.getMlcRegistration(user.tenantId, bodyId);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateMortuaryBodyDto) {
    return this.bodiesService.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMortuaryBodyDto) {
    return this.bodiesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.bodiesService.remove(user.tenantId, id);
    return { message: 'Body deleted successfully' };
  }
}
