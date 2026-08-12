import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { IncidentSettingsService } from './incident-settings.service';
import { IncidentNotificationRuleService } from '../notifications/incident-notification-rule.service';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateTypeDto, UpdateTypeDto,
  CreateSeverityDto,
  UpdateRiskMatrixCellDto,
  CreateNotificationRuleDto, UpdateNotificationRuleDto,
  CreateNotificationRoleDto, UpdateNotificationRoleDto,
} from '../dto/incident-settings.dto';

@ApiTags('Incident Settings')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/settings')
export class IncidentSettingsController {
  constructor(
    private readonly settingsService: IncidentSettingsService,
    private readonly notifRuleService: IncidentNotificationRuleService,
  ) {}

  @Get()
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  @ApiOperation({ summary: 'Get all settings (categories, severity, priority, risk matrix)' })
  getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  // ── Categories ────────────────────────────────────────────────────────────

  @Get('categories')
  @RequirePermissions('INCIDENT:INCIDENTS:CREATE')
  getCategories() { return this.settingsService.getCategories(); }

  @Post('categories')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  createCategory(@Body() dto: CreateCategoryDto) { return this.settingsService.createCategory(dto); }

  @Patch('categories/:id')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.settingsService.updateCategory(id, dto);
  }

  // ── Types ─────────────────────────────────────────────────────────────────

  @Get('types')
  @RequirePermissions('INCIDENT:INCIDENTS:CREATE')
  getTypes(@Query('categoryId') categoryId?: string) { return this.settingsService.getTypes(categoryId); }

  @Post('types')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  createType(@Body() dto: CreateTypeDto) { return this.settingsService.createType(dto); }

  @Patch('types/:id')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  updateType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTypeDto) {
    return this.settingsService.updateType(id, dto);
  }

  // ── Severity ──────────────────────────────────────────────────────────────

  @Get('severity')
  @RequirePermissions('INCIDENT:INCIDENTS:CREATE')
  getSeverity() { return this.settingsService.getSeverityLevels(); }

  @Post('severity')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  createSeverity(@Body() dto: CreateSeverityDto) { return this.settingsService.createSeverity(dto); }

  @Patch('severity/:id')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  updateSeverity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreateSeverityDto>) {
    return this.settingsService.updateSeverity(id, dto);
  }

  // ── Risk Matrix ───────────────────────────────────────────────────────────

  @Get('risk-matrix')
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  getRiskMatrix() { return this.settingsService.getRiskMatrix(); }

  @Post('risk-matrix')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  updateRiskMatrixCell(@Body() dto: UpdateRiskMatrixCellDto) {
    return this.settingsService.updateRiskMatrixCell(dto);
  }

  // ── Notification Roles (incident-scoped, distinct from platform RBAC) ──────

  @Get('notification-roles')
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'List incident-scoped notification roles (e.g. RISK_MANAGER) with their descriptions' })
  getNotificationRoles() {
    return this.settingsService.getNotificationRoles();
  }

  @Post('notification-roles')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  createNotificationRole(@Body() dto: CreateNotificationRoleDto) {
    return this.settingsService.createNotificationRole(dto);
  }

  @Patch('notification-roles/:id')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  updateNotificationRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNotificationRoleDto) {
    return this.settingsService.updateNotificationRole(id, dto);
  }

  @Get('notification-roles/:id/members')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  @ApiOperation({ summary: 'List users assigned to an incident notification role' })
  getNotificationRoleMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.getNotificationRoleMembers(id);
  }

  @Post('notification-roles/:id/members/:userId')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  @ApiOperation({ summary: 'Assign a user to an incident notification role' })
  addNotificationRoleMember(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.settingsService.addNotificationRoleMember(id, userId);
  }

  @Delete('notification-roles/:id/members/:userId')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  @ApiOperation({ summary: 'Remove a user from an incident notification role' })
  removeNotificationRoleMember(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.settingsService.removeNotificationRoleMember(id, userId);
  }

  // ── Notification Rules ────────────────────────────────────────────────────

  @Get('notification-rules')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  getNotificationRules(@CurrentUser() actor: User) {
    return this.notifRuleService.findAll();
  }

  @Post('notification-rules')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  createNotificationRule(@Body() dto: CreateNotificationRuleDto) {
    return this.notifRuleService.create(dto);
  }

  @Patch('notification-rules/:id')
  @RequirePermissions('INCIDENT:SETTINGS:MANAGE')
  updateNotificationRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNotificationRuleDto) {
    return this.notifRuleService.update(id, dto);
  }
}
