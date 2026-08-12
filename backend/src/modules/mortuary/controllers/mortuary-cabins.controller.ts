import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryCabinsService } from '../services/mortuary-cabins.service';
import { CreateMortuaryCabinDto } from '../dto/create-mortuary-cabin.dto';
import { UpdateMortuaryCabinDto } from '../dto/update-mortuary-cabin.dto';

/** Mortuary integration (Phase 2, Stage D). Permission matrix: see Stage D report §2/§3. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/cabins')
export class MortuaryCabinsController {
  constructor(private readonly cabinsService: MortuaryCabinsService) {}

  @Get()
  @RequirePermissions('MORTUARY:CABINS:READ')
  findAll(@CurrentUser() user: User) {
    return this.cabinsService.findAll(user.tenantId);
  }

  @Post()
  @RequirePermissions('MORTUARY:CABINS:MANAGE')
  create(@CurrentUser() user: User, @Body() dto: CreateMortuaryCabinDto) {
    return this.cabinsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('MORTUARY:CABINS:MANAGE')
  update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMortuaryCabinDto) {
    return this.cabinsService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('MORTUARY:CABINS:MANAGE')
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.cabinsService.deactivate(user.tenantId, id);
    return { message: 'Cabin deactivated' };
  }
}
