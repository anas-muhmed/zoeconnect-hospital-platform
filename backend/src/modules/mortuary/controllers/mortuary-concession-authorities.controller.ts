import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryConcessionAuthoritiesService } from '../services/mortuary-concession-authorities.service';
import { CreateMortuaryConcessionAuthorityDto } from '../dto/create-mortuary-concession-authority.dto';

/** Mortuary integration (Phase 2, Stage C). `@RequirePermissions()` deferred to Stage D — see Stage C report. */
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/concession-authorities')
export class MortuaryConcessionAuthoritiesController {
  constructor(private readonly service: MortuaryConcessionAuthoritiesService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.service.findAllActive(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateMortuaryConcessionAuthorityDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.deactivate(user.tenantId, id);
    return { message: 'Concession authority deleted successfully' };
  }
}
