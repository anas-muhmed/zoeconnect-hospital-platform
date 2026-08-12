import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuarySettingsService } from '../services/mortuary-settings.service';
import { UpdateMortuaryBillingSettingsDto } from '../dto/update-mortuary-billing-settings.dto';
import { UpdateMortuaryNameDto } from '../dto/update-mortuary-name.dto';

/**
 * Mortuary integration (Phase 2, Stage C). Ports `settingsController.js`,
 * minus logo upload/read (`uploadMortuaryLogo`/`getMortuaryLogo` — Stage
 * E, object-repository) and `getMortuaryName`'s hospital-address lookup
 * (that endpoint denormalized address from the old `hospitals` table;
 * Stage C's tenant already carries its own name via `Tenant.name`, and
 * `MortuaryHospitalProfile.address` — see Stage A — covers the rest once a
 * frontend needs it in Stage F).
 */
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/settings')
export class MortuarySettingsController {
  constructor(private readonly settingsService: MortuarySettingsService) {}

  @Get('billing')
  getBillingSettings(@CurrentUser() user: User) {
    return this.settingsService.getOrCreate(user.tenantId);
  }

  @Post('billing')
  updateBillingSettings(@CurrentUser() user: User, @Body() dto: UpdateMortuaryBillingSettingsDto) {
    return this.settingsService.updateBillingSettings(user.tenantId, dto, user.username);
  }

  @Get('mortuary-name')
  async getMortuaryName(@CurrentUser() user: User) {
    const settings = await this.settingsService.getOrCreate(user.tenantId);
    return { mortuaryName: settings.mortuaryName };
  }

  @Post('mortuary-name')
  async updateMortuaryName(@CurrentUser() user: User, @Body() dto: UpdateMortuaryNameDto) {
    const settings = await this.settingsService.updateName(user.tenantId, dto, user.username);
    return { message: 'Mortuary name updated successfully', mortuaryName: settings.mortuaryName };
  }
}
