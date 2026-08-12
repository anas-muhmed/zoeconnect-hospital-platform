import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryConcessionAuthoritiesService } from '../services/mortuary-concession-authorities.service';
import { CreateMortuaryConcessionAuthorityDto } from '../dto/create-mortuary-concession-authority.dto';

/** Mortuary integration (Phase 2, Stage D). Permission matrix: see Stage D report §2/§3. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/concession-authorities')
export class MortuaryConcessionAuthoritiesController {
  constructor(private readonly service: MortuaryConcessionAuthoritiesService) {}

  @Get()
  @RequirePermissions('MORTUARY:CONCESSION_AUTHORITIES:READ')
  findAll(@CurrentUser() user: User) {
    return this.service.findAllActive(user.tenantId);
  }

  @Post()
  @RequirePermissions('MORTUARY:CONCESSION_AUTHORITIES:MANAGE')
  create(@CurrentUser() user: User, @Body() dto: CreateMortuaryConcessionAuthorityDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Delete(':id')
  @RequirePermissions('MORTUARY:CONCESSION_AUTHORITIES:MANAGE')
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.deactivate(user.tenantId, id);
    return { message: 'Concession authority deleted successfully' };
  }
}
