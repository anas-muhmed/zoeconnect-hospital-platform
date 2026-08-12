import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { FeedbackSettingsService } from './feedback-settings.service';
import { UpdateFeedbackSettingsDto } from '../dto/feedback-settings.dto';

/**
 * Module-wide, admin-tunable configuration (v1.0 capstone phase) --
 * replaces the hardcoded constants scattered across earlier phases. See
 * FeedbackSettingsService's doc comment for the caching strategy.
 */
@ApiTags('Feedback Settings')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('feedback/settings')
export class FeedbackSettingsController {
  constructor(private readonly settingsService: FeedbackSettingsService) {}

  @Get()
  @RequirePermissions('FEEDBACK:SETTINGS:MANAGE')
  @ApiOperation({ summary: 'Get module-wide feedback settings' })
  get() {
    return this.settingsService.get();
  }

  @Patch()
  @RequirePermissions('FEEDBACK:SETTINGS:MANAGE')
  @ApiOperation({ summary: 'Update module-wide feedback settings' })
  update(@Body() dto: UpdateFeedbackSettingsDto, @CurrentUser() actor: User) {
    return this.settingsService.update(dto, actor.id);
  }
}
