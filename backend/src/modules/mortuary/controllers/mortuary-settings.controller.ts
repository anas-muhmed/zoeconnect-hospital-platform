import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuarySettingsService } from '../services/mortuary-settings.service';
import { UpdateMortuaryBillingSettingsDto } from '../dto/update-mortuary-billing-settings.dto';
import { UpdateMortuaryNameDto } from '../dto/update-mortuary-name.dto';

/**
 * Mortuary integration (Phase 2, Stage D). Ports `settingsController.js`,
 * minus logo upload/read (Stage E). Permission matrix: see Stage D
 * report §2/§3.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/settings')
export class MortuarySettingsController {
  constructor(private readonly settingsService: MortuarySettingsService) {}

  @Get('billing')
  @RequirePermissions('MORTUARY:SETTINGS:READ')
  getBillingSettings(@CurrentUser() user: User) {
    return this.settingsService.getOrCreate(user.tenantId);
  }

  @Post('billing')
  @RequirePermissions('MORTUARY:SETTINGS:MANAGE')
  updateBillingSettings(@CurrentUser() user: User, @Body() dto: UpdateMortuaryBillingSettingsDto) {
    return this.settingsService.updateBillingSettings(user.tenantId, dto, user.username);
  }

  @Get('mortuary-name')
  @RequirePermissions('MORTUARY:SETTINGS:READ')
  async getMortuaryName(@CurrentUser() user: User) {
    const settings = await this.settingsService.getOrCreate(user.tenantId);
    return { mortuaryName: settings.mortuaryName };
  }

  @Post('mortuary-name')
  @RequirePermissions('MORTUARY:SETTINGS:MANAGE')
  async updateMortuaryName(@CurrentUser() user: User, @Body() dto: UpdateMortuaryNameDto) {
    const settings = await this.settingsService.updateName(user.tenantId, dto, user.username);
    return { message: 'Mortuary name updated successfully', mortuaryName: settings.mortuaryName };
  }
}
