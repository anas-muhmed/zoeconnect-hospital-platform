import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { PermissionsService } from './permissions.service';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from './dto/create-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';
import type { User } from '../users/entities/user.entity';

/** Stage B (Checkpoint B3.3) — see `users.controller.ts`'s equivalent note; same reasoning applies here. */
@ApiTags('RBAC')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('rbac')
export class RbacController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // ── Roles ─────────────────────────────────────────────────────────────────

  @Get('roles')
  @RequirePermissions('PLATFORM:ROLES:READ')
  @ApiOperation({ summary: 'List all roles with permissions' })
  findAllRoles() {
    return this.rolesService.findAll();
  }

  @Get('roles/:id')
  @RequirePermissions('PLATFORM:ROLES:READ')
  @ApiOperation({ summary: 'Get role by ID' })
  findRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @Post('roles')
  @RequirePermissions('PLATFORM:ROLES:CREATE')
  @Audit({ action: 'CREATE_ROLE', module: 'PLATFORM', entityType: 'role' })
  @ApiOperation({ summary: 'Create a new role' })
  createRole(@Body() dto: CreateRoleDto, @CurrentUser() actor: User) {
    return this.rolesService.create(dto, actor.id);
  }

  @Patch('roles/:id')
  @RequirePermissions('PLATFORM:ROLES:UPDATE')
  @Audit({ action: 'UPDATE_ROLE', module: 'PLATFORM', entityType: 'role' })
  @ApiOperation({ summary: 'Update role name/description/permissions' })
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: User,
  ) {
    return this.rolesService.update(id, dto, actor.id);
  }

  @Patch('roles/:id/permissions')
  @RequirePermissions('PLATFORM:ROLES:UPDATE')
  @Audit({ action: 'ASSIGN_PERMISSIONS', module: 'PLATFORM', entityType: 'role' })
  @ApiOperation({ summary: 'Replace all permissions for a role' })
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() actor: User,
  ) {
    return this.rolesService.assignPermissions(id, dto, actor.id);
  }

  // ── Role Membership ───────────────────────────────────────────────────────

  @Get('roles/:id/users')
  @RequirePermissions('PLATFORM:ROLES:READ')
  @ApiOperation({ summary: 'List users assigned to a role' })
  getRoleMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.getRoleMembers(id);
  }

  @Post('roles/:id/users/:userId')
  @RequirePermissions('PLATFORM:ROLES:UPDATE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'ASSIGN_ROLE_MEMBER', module: 'PLATFORM', entityType: 'role' })
  @ApiOperation({ summary: 'Assign a user to a role' })
  addRoleMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: User,
  ) {
    return this.rolesService.addRoleMember(id, userId, actor.id);
  }

  @Delete('roles/:id/users/:userId')
  @RequirePermissions('PLATFORM:ROLES:UPDATE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'REMOVE_ROLE_MEMBER', module: 'PLATFORM', entityType: 'role' })
  @ApiOperation({ summary: 'Remove a user from a role' })
  removeRoleMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: User,
  ) {
    return this.rolesService.removeRoleMember(id, userId, actor.id);
  }

  // ── Permissions ───────────────────────────────────────────────────────────

  @Get('permissions')
  @RequirePermissions('PLATFORM:ROLES:READ')
  @ApiOperation({ summary: 'List all permissions' })
  @ApiQuery({ name: 'grouped', required: false, type: Boolean, description: 'Group by module and resource' })
  findAllPermissions(@Query('grouped') grouped?: string) {
    return this.permissionsService.findAll(grouped === 'true');
  }
}
