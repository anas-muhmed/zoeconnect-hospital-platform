import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationService }   from './notification.service';
import { SendNotificationDto, CreateTemplateDto, UpdateTemplateDto } from './dto/notification.dto';
import { JwtAuthGuard }          from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard }      from '../../common/guards/permissions.guard';
import { LicenseGuard }          from '../licensing/license.guard';
import { RequirePermissions }    from '../../common/decorators/permissions.decorator';
import { RequireModule }         from '../licensing/decorators/require-module.decorator';
import { CurrentUser }           from '../../common/decorators/current-user.decorator';
import { Audit }                 from '../../common/decorators/audit.decorator';
import type { User }             from '../users/entities/user.entity';
import type { NotificationEventType, NotificationChannel } from './notification.types';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';

/**
 * Stage B (Checkpoint B3.1) — `TenantContextInterceptor` is applied on
 * this controller only, per the explicit B3.1 scope boundary: no global
 * `APP_INTERCEPTOR` registration, no other controller affected. It
 * populates `TenantContextStorage` for the duration of each request here,
 * which `NotificationService`'s four scoped read methods rely on.
 */
@ApiTags('Notifications')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('LOYALTY')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifService: NotificationService) {}

  // ── Manual send (admin/testing) ───────────────────────────────────────────

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('PLATFORM:NOTIFICATIONS:CREATE')
  @Audit({ action: 'NOTIFICATION_SEND', module: 'NOTIFICATIONS', entityType: 'notification' })
  @ApiOperation({ summary: 'Manually enqueue a notification' })
  send(@Body() dto: SendNotificationDto) {
    return this.notifService.send({
      phone:           dto.phone,
      channel:         dto.channel,
      eventType:       dto.eventType,
      templateName:    dto.templateName,
      languageCode:    dto.languageCode ?? 'en_US',
      templateParams:  dto.templateParams ?? [],
      loyaltyAccountId: dto.loyaltyAccountId,
      mrn:             dto.mrn,
    });
  }

  // ── Notification log ──────────────────────────────────────────────────────

  @Get('logs')
  @RequirePermissions('PLATFORM:NOTIFICATIONS:READ')
  @ApiOperation({ summary: 'List notification logs (paginated)' })
  @ApiQuery({ name: 'page',    required: false, type: Number })
  @ApiQuery({ name: 'limit',   required: false, type: Number })
  @ApiQuery({ name: 'phone',   required: false })
  @ApiQuery({ name: 'status',  required: false, enum: ['PENDING','SENT','FAILED','DELIVERED'] })
  @ApiQuery({ name: 'eventType', required: false })
  @ApiQuery({ name: 'channel',   required: false, enum: ['WHATSAPP','SMS','EMAIL'] })
  @ApiQuery({ name: 'loyaltyAccountId', required: false })
  findLogs(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('phone')             phone?: string,
    @Query('status')            status?: string,
    @Query('eventType')         eventType?: NotificationEventType,
    @Query('channel')           channel?: NotificationChannel,
    @Query('loyaltyAccountId')  loyaltyAccountId?: string,
  ) {
    return this.notifService.findLogs({ page, limit, phone, status, eventType, channel, loyaltyAccountId });
  }

  @Get('logs/:id')
  @RequirePermissions('PLATFORM:NOTIFICATIONS:READ')
  @ApiOperation({ summary: 'Get a specific notification log entry' })
  findLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifService.findLogById(id);
  }

  @Post('logs/:id/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('PLATFORM:NOTIFICATIONS:CREATE')
  @Audit({ action: 'NOTIFICATION_RESEND', module: 'NOTIFICATIONS', entityType: 'notification' })
  @ApiOperation({ summary: 'Resend a failed notification' })
  resend(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifService.resend(id);
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  @Get('templates')
  @RequirePermissions('PLATFORM:NOTIFICATIONS:READ')
  @ApiOperation({ summary: 'List notification templates' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findTemplates(@Query('activeOnly') activeOnly?: string) {
    return this.notifService.findTemplates(activeOnly === 'true');
  }

  @Get('templates/:id')
  @RequirePermissions('PLATFORM:NOTIFICATIONS:READ')
  @ApiOperation({ summary: 'Get a notification template by ID' })
  findTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifService.findTemplate(id);
  }

  @Post('templates')
  @RequirePermissions('PLATFORM:NOTIFICATIONS:CREATE')
  @Audit({ action: 'NOTIFICATION_TEMPLATE_CREATE', module: 'NOTIFICATIONS', entityType: 'notification_template' })
  @ApiOperation({ summary: 'Create a notification template' })
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.notifService.createTemplate(dto);
  }

  @Patch('templates/:id')
  @RequirePermissions('PLATFORM:NOTIFICATIONS:UPDATE')
  @Audit({ action: 'NOTIFICATION_TEMPLATE_UPDATE', module: 'NOTIFICATIONS', entityType: 'notification_template' })
  @ApiOperation({ summary: 'Update a notification template' })
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.notifService.updateTemplate(id, dto);
  }
}
