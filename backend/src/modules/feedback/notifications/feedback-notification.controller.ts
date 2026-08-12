import { Controller, Get, Patch, Param, Query, UseGuards, UseInterceptors, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import { FeedbackNotificationService } from './feedback-notification.service';

/**
 * In-app "something needs your attention" feed for staff -- reuses
 * FEEDBACK:COMPLAINT:VIEW (see FeedbackNotification's doc comment) rather
 * than a dedicated permission.
 */
@ApiTags('Feedback Notifications')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/notifications')
export class FeedbackNotificationController {
  constructor(private readonly notificationService: FeedbackNotificationService) {}

  @Get()
  @RequirePermissions('FEEDBACK:COMPLAINT:VIEW')
  @ApiOperation({ summary: 'List recent notifications (?unreadOnly=true to filter)' })
  list(@ActiveBranchId() branchId: string, @Query('unreadOnly') unreadOnly?: string) {
    return this.notificationService.list(branchId, unreadOnly === 'true');
  }

  @Get('unread-count')
  @RequirePermissions('FEEDBACK:COMPLAINT:VIEW')
  @ApiOperation({ summary: 'Unread notification count, for a badge' })
  async unreadCount(@ActiveBranchId() branchId: string) {
    return { count: await this.notificationService.unreadCount(branchId) };
  }

  @Patch(':id/read')
  @RequirePermissions('FEEDBACK:COMPLAINT:VIEW')
  @ApiOperation({ summary: 'Mark one notification read' })
  async markRead(@Param('id', ParseUUIDPipe) id: string) {
    await this.notificationService.markRead(id);
    return { ok: true };
  }

  @Patch('read-all')
  @RequirePermissions('FEEDBACK:COMPLAINT:VIEW')
  @ApiOperation({ summary: 'Mark every notification read' })
  async markAllRead(@ActiveBranchId() branchId: string) {
    await this.notificationService.markAllRead(branchId);
    return { ok: true };
  }
}
