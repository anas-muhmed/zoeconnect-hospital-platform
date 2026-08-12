import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all system settings' })
  getSettings(@CurrentUser() user: User) {
    // Fix (2026-07-20): this used to call getSettings() with no tenant at
    // all -- one global row per key, shared by every tenant. Explicit
    // user.tenantId here, not ambient context, since this controller has
    // no TenantContextInterceptor wired (see SettingsService's doc
    // comment for the full incident).
    return this.settingsService.getSettings(user.tenantId);
  }
}
