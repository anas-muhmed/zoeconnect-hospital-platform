import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus, ParseUUIDPipe, UseGuards, UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, AdminResetPasswordDto } from './dto/update-user.dto';
import { AssignUserPermissionsDto } from './dto/create-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ActiveBranchId } from '../../common/decorators/active-branch.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';
import type { User } from './entities/user.entity';

/**
 * Stage B (Checkpoint B3.3) — `TenantContextInterceptor` applied at class
 * level: every route on this controller is already an authenticated,
 * users/RBAC-only admin flow (no public/login routes mixed in, unlike
 * `AuthController`), so controller-wide coverage carries no extra blast
 * radius here. See `HYBRID_ARCHITECTURE_LOG.md`'s B3.3 entry.
 */
@ApiTags('Users')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── GET /api/v1/users ────────────────────────────────────────────────────
  @Get()
  @RequirePermissions('PLATFORM:USERS:READ')
  @ApiOperation({ summary: 'List all users (paginated, scoped to the active branch — applies even to SUPER_ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @ActiveBranchId() branchId?: string,
  ) {
    return this.usersService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      search,
      branchId,
    );
  }

  // ── GET /api/v1/users/check-availability ─────────────────────────────────
  //
  // Declared before `GET /:id` so a literal path segment can never be
  // swallowed by the `:id` param route -- Fastify's find-my-way router
  // prioritises static routes over parametric ones regardless of
  // registration order, but keeping the more-specific route first here
  // avoids relying on that router-specific guarantee.
  //
  // Backed by the shared `AvailabilityCheckService` (`common/validation`) --
  // the same reusable SELECT-EXISTS infrastructure any future
  // Organization/Tenant/Client/Vendor-Portal/Registration uniqueness check
  // is expected to use, not a one-off for this form. Any authenticated
  // platform user may call this (no extra `@RequirePermissions` beyond the
  // controller-wide guards) since both the create and edit forms need it and
  // the response leaks nothing beyond a boolean + reason per field.
  @Get('check-availability')
  @ApiOperation({ summary: 'Check whether a username and/or email are available (create and edit forms)' })
  @ApiQuery({ name: 'username', required: false, type: String })
  @ApiQuery({ name: 'email', required: false, type: String })
  @ApiQuery({ name: 'excludeUserId', required: false, type: String, description: "The current user's own id when editing, so their own username/email don't conflict with themselves" })
  checkAvailability(
    @Query('username') username?: string,
    @Query('email') email?: string,
    @Query('excludeUserId') excludeUserId?: string,
  ) {
    return this.usersService.checkAvailability({ username, email, excludeUserId });
  }

  // ── GET /api/v1/users/:id ────────────────────────────────────────────────
  @Get(':id')
  @RequirePermissions('PLATFORM:USERS:READ')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  // ── POST /api/v1/users ───────────────────────────────────────────────────
  @Post()
  @RequirePermissions('PLATFORM:USERS:CREATE')
  @Audit({ action: 'CREATE_USER', module: 'PLATFORM', entityType: 'user' })
  @ApiOperation({ summary: 'Create new platform user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Username or email already exists' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: User) {
    return this.usersService.create(dto, actor.id);
  }

  // ── PATCH /api/v1/users/:id ──────────────────────────────────────────────
  @Patch(':id')
  @RequirePermissions('PLATFORM:USERS:UPDATE')
  @Audit({ action: 'UPDATE_USER', module: 'PLATFORM', entityType: 'user' })
  @ApiOperation({ summary: 'Update user profile or role' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: User,
  ) {
    try {
      return await this.usersService.update(id, dto, actor.id);
    } catch (e) {
      require('fs').writeFileSync('d:\\HDSP_HYBRID\\backend\\error_debug.txt', String(e.stack || e));
      console.error("!!! UPDATE ERROR !!!", e);
      throw e;
    }
  }

  // ── PATCH /api/v1/users/:id/activate ────────────────────────────────────
  @Patch(':id/activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('PLATFORM:USERS:UPDATE')
  @Audit({ action: 'ACTIVATE_USER', module: 'PLATFORM', entityType: 'user' })
  @ApiOperation({ summary: 'Activate a user account' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.usersService.setActive(id, true, actor.id);
  }

  // ── PATCH /api/v1/users/:id/deactivate ──────────────────────────────────
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('PLATFORM:USERS:UPDATE')
  @Audit({ action: 'DEACTIVATE_USER', module: 'PLATFORM', entityType: 'user' })
  @ApiOperation({ summary: 'Deactivate a user account' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.usersService.setActive(id, false, actor.id);
  }

  // ── POST /api/v1/users/:id/reset-password ───────────────────────────────
  @Post(':id/reset-password')
  @RequirePermissions('PLATFORM:USERS:UPDATE')
  @Audit({ action: 'ADMIN_RESET_PASSWORD', module: 'PLATFORM', entityType: 'user' })
  @ApiOperation({ summary: 'Admin reset user password (force-change on next login)' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() actor: User,
  ) {
    return this.usersService.adminResetPassword(id, dto.newPassword, actor.id);
  }

  // ── PATCH /api/v1/users/:id/permissions ─────────────────────────────────
  @Patch(':id/permissions')
  @RequirePermissions('PLATFORM:USERS:UPDATE')
  @Audit({ action: 'ASSIGN_USER_PERMISSIONS', module: 'PLATFORM', entityType: 'user' })
  @ApiOperation({ summary: 'Replace direct permissions for a user (does not affect role permissions)' })
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserPermissionsDto,
    @CurrentUser() actor: User,
  ) {
    return this.usersService.assignPermissions(id, dto.permissionIds, actor.id);
  }

  // ── POST /api/v1/users/:id/unlock ───────────────────────────────────────
  @Post(':id/unlock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('PLATFORM:USERS:UPDATE')
  @Audit({ action: 'UNLOCK_ACCOUNT', module: 'PLATFORM', entityType: 'user' })
  @ApiOperation({ summary: 'Unlock a locked user account' })
  unlock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.usersService.unlockAccount(id, actor.id);
  }
}
