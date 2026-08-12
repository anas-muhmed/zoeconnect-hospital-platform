import {
  Controller, Post, Get, Body, Req, Res, Param, HttpCode, HttpStatus, UseGuards, UseInterceptors, UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest, FastifyReply } from 'fastify';
import { IsString as IsStringVal, IsNotEmpty as IsNotEmptyVal, IsOptional as IsOptionalVal } from 'class-validator';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { VendorSyncService } from '../licensing/vendor-sync.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { User } from '../users/entities/user.entity';
import type { JwtPayload } from './strategies/jwt.strategy';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';
import { NoStoreInterceptor } from '../../common/interceptors/no-store.interceptor';

class SelectBranchDto {
  @IsStringVal()
  @IsNotEmptyVal()
  branchId!: string;
}

export class HisLoginDto {
  @IsStringVal()
  @IsNotEmptyVal()
  hisUsername!: string;

  @IsStringVal()
  @IsNotEmptyVal()
  hisBranchId!: string;

  @IsStringVal()
  @IsNotEmptyVal()
  hisDepartmentId!: string;

  @IsStringVal()
  @IsNotEmptyVal()
  hisServiceCenterId!: string;

  // Optional: HIS's own display names for the department/service center it has
  // selected. Oracle's hisdepartment/servicecenter tables (queried via
  // HisTokenBridgeService for the manual join panel) don't always contain the
  // exact record HIS itself is using -- sending the name directly from HIS avoids
  // depending on that lookup succeeding just to render a label.
  @IsOptionalVal()
  @IsStringVal()
  hisDepartmentName?: string;

  @IsOptionalVal()
  @IsStringVal()
  hisServiceCenterName?: string;
}

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly vendorSyncService: VendorSyncService,
  ) {}

  // -- POST /api/v1/auth/login -------------------------------------------------
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Authenticate user and obtain JWT tokens' })
  @ApiResponse({ status: 200, description: 'Login successful - returns access + refresh tokens + branches' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  @Audit({ action: 'LOGIN_ATTEMPT', module: 'AUTH' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest & { tenantId?: string },
  ) {
    const ip = req.headers['x-forwarded-for'] as string ?? req.ip ?? '';
    const ua = req.headers['user-agent'] ?? '';
    // Tenant-Scoped User Identity, Task 3: req.tenantId is set ambiently by
    // SubdomainTenantMiddleware on every request -- threaded through so
    // AuthService.login()'s shadow-mode comparison (LOGIN_TENANT_SCOPE_MODE)
    // has a tenant to compare against. Default mode ('shadow') doesn't
    // change what's actually returned here.
    return this.authService.login(dto, ip, ua, req.tenantId);
  }

  // ── POST /api/v1/auth/his-login ─────────────────────────────────────────────
  @Public()
  @Post('his-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Authenticate HIS user and obtain JWT tokens' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'HIS user not mapped or lacks permissions' })
  @ApiResponse({ status: 403, description: 'User lacks token module permissions' })
  @Audit({ action: 'HIS_LOGIN_ATTEMPT', module: 'AUTH' })
  async hisLogin(
    @Body() dto: HisLoginDto,
    @Req() req: FastifyRequest & { tenantId?: string },
  ) {
    const ip = req.headers['x-forwarded-for'] as string ?? req.ip ?? '';
    const ua = req.headers['user-agent'] ?? '';
    // Tenant-Scoped User Identity, Task 2: req.tenantId is set ambiently by
    // SubdomainTenantMiddleware on every request (this route is @Public()
    // but the middleware runs regardless), same pattern as
    // setupSuperAdmin()/isSetupRequired() above (Task 8.4). hisLogin() itself
    // guards against the rare case req.tenantId is unset.
    return this.authService.hisLogin(dto, ip, ua, req.tenantId);
  }

  // ── POST /api/v1/auth/logout ────────────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout - revoke current access token' })
  async logout(
    @CurrentUser() user: User, 
    @Req() req: FastifyRequest,
    @Body() dto: LogoutDto
  ) {
    const payload = this.extractPayload(req);
    const ip = req.headers['x-forwarded-for'] as string ?? req.ip ?? '';
    const ua = req.headers['user-agent'] ?? '';
    await this.authService.logout(user.id, payload.jti, ip, dto.reason, user.tenantId, ua);
  }

  // ── POST /api/v1/auth/activity ──────────────────────────────────────────────
  @Post('activity')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Ping to keep session alive' })
  async recordActivity(@CurrentUser() user: User, @Req() req: FastifyRequest) {
    const payload = this.extractPayload(req);
    await this.authService.recordActivity(user.id, payload.jti, user.tenantId);
    return { ok: true };
  }

  // -- POST /api/v1/auth/refresh ------------------------------------------------
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Obtain a new access token using a refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  // -- GET /api/v1/auth/profile --------------------------------------------------
  @Get('profile')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get current user profile, permissions, and branches' })
  async getProfile(@CurrentUser() user: User, @Req() req: FastifyRequest) {
    const payload = this.extractPayload(req);
    return this.authService.getProfile(
      user,
      payload.activeBranchId,
      payload.activeDepartmentId,
      payload.activeServiceCenterId,
      payload.isHisIntegration,
      payload.activeDepartmentName,
      payload.activeServiceCenterName,
    );
  }

  // -- GET /api/v1/auth/session/health -------------------------------------------
  @Get('session/health')
  @ApiBearerAuth('JWT')
  @UseInterceptors(NoStoreInterceptor)
  @ApiOperation({ summary: 'Get lightweight session health status' })
  async getSessionHealth(@CurrentUser() user: User, @Req() req: FastifyRequest) {
    const payload = this.extractPayload(req);
    return this.authService.getSessionHealth(user, payload.jti);
  }

  // -- GET /api/v1/auth/session --------------------------------------------------
  @Get('session')
  @ApiBearerAuth('JWT')
  @UseInterceptors(NoStoreInterceptor)
  @ApiOperation({ summary: 'Get session configuration and user profile' })
  async getSession(@CurrentUser() user: User, @Req() req: FastifyRequest) {
    const payload = this.extractPayload(req);
    return this.authService.getSessionContext(
      user,
      payload.activeBranchId,
      payload.activeDepartmentId,
      payload.activeServiceCenterId,
      payload.isHisIntegration,
      payload.activeDepartmentName,
      payload.activeServiceCenterName,
    );
  }

  // -- POST /api/v1/auth/select-branch --------------------------------------------
  @Post('select-branch')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Select or switch active branch - returns new access token' })
  @ApiResponse({ status: 200, description: 'Branch selected - new accessToken issued' })
  @ApiResponse({ status: 403, description: 'User does not have access to this branch' })
  async selectBranch(
    @CurrentUser() user: User,
    @Body() dto: SelectBranchDto,
    @Req() req: FastifyRequest,
  ) {
    const payload = this.extractPayload(req);
    return this.authService.selectBranch(user.id, dto.branchId, payload.jti);
  }

  // ── POST /api/v1/auth/widget-token/renew ────────────────────────────────────
  // Superseded by the cookie-based widget-bootstrap flow below, which also
  // enforces idle-session-timeout (this endpoint does not). Left in place for
  // backward compatibility only; the Registration widget no longer calls it.
  @Post('widget-token/renew')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: '[Deprecated] Silently renew the caller\'s access token. Use widget-bootstrap instead.' })
  @ApiResponse({ status: 200, description: 'New short-lived access token issued' })
  @ApiResponse({ status: 401, description: 'Current token invalid, expired, or account locked' })
  async renewWidgetToken(@CurrentUser() user: User, @Req() req: FastifyRequest) {
    const payload = this.extractPayload(req);
    return this.authService.renewWidgetToken(user.id, payload.jti, payload.activeBranchId ?? null);
  }

  // ── ZoeConnect Registration widget: fully self-contained authentication ──────────
  // The widget iframe carries NO query parameters and receives NO credentials
  // from HIS. It authenticates itself entirely against ZoeConnect using these three
  // endpoints and a single httpOnly cookie. Because the widget is embedded
  // same-origin (Nginx proxies /hdsp/ in front of both HIS and ZoeConnect), this
  // cookie is first-party from the browser's perspective -- no third-party
  // cookie restrictions apply, and no data ever needs to pass through HIS.

  private static readonly WIDGET_COOKIE = 'hdsp_widget_session';
  private static readonly WIDGET_COOKIE_PATH = '/api/v1/auth';

  private widgetCookieOptions(maxAgeSeconds: number) {
    return {
      httpOnly: true,
      secure:   true,
      sameSite: 'lax' as const,
      path:     AuthController.WIDGET_COOKIE_PATH,
      maxAge:   maxAgeSeconds,
    };
  }

  // ── POST /api/v1/auth/widget-login ──────────────────────────────────────────
  @Public()
  @Post('widget-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'One-time widget sign-in. Sets an httpOnly session cookie; no HIS involvement.' })
  @ApiResponse({ status: 200, description: 'Signed in -- access token returned, refresh token stored as httpOnly cookie' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Audit({ action: 'WIDGET_LOGIN_ATTEMPT', module: 'AUTH' })
  async widgetLogin(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest & { tenantId?: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) ?? req.ip ?? '';
    const ua = (req.headers['user-agent'] as string) ?? '';
    // Tenant-Scoped User Identity, Task 3: same req.tenantId thread-through
    // as the main login() route above, for shadow-mode observability on the
    // widget path too.
    const result = await this.authService.login(dto, ip, ua, req.tenantId);

    // ZoeConnect Identity Architecture Migration, Phase 5 -- the
    // Host-vs-JWT cross-check formerly here (checkWidgetLoginTenantScope(),
    // Phase 8 Task 8.5's widget-flow counterpart to TenantScopeGuard) is
    // removed for the same reason TenantScopeGuard's registration is: it's
    // the identical Host-header dependency for an authenticated session,
    // just reimplemented at this call site because widget-* routes are
    // @Public() and never reach that guard. See AuthService.assertTenantScope's
    // doc comment (kept, unused, for reference/rollback).

    const refreshTtlSeconds = this.authService.getWidgetSessionTtlSeconds();
    reply.setCookie(
      AuthController.WIDGET_COOKIE,
      result.refreshToken,
      this.widgetCookieOptions(refreshTtlSeconds),
    );

    // Refresh token never leaves the server in the response body for this
    // flow -- it only ever exists as an httpOnly cookie the widget's own JS
    // cannot read, unlike the main SPA's login response.
    return { accessToken: result.accessToken, user: result.user };
  }

  // ── GET /api/v1/auth/widget-bootstrap ───────────────────────────────────────
  @Public()
  @Get('widget-bootstrap')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Silent self-bootstrap from the httpOnly widget session cookie. No credentials in the request.' })
  @ApiResponse({ status: 200, description: 'Session valid -- new access token + branches returned, cookie rotated' })
  @ApiResponse({ status: 401, description: 'No session cookie, or it is invalid/expired -- widget should show its own login form' })
  async widgetBootstrap(
    @Req() req: FastifyRequest & { tenantId?: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const cookieValue = req.cookies?.[AuthController.WIDGET_COOKIE];
    if (!cookieValue) {
      throw new UnauthorizedException({ error: 'NO_SESSION', message: 'No widget session. Please sign in.' });
    }

    try {
      const result = await this.authService.widgetBootstrap(cookieValue);
      // ZoeConnect Identity Architecture Migration, Phase 5 -- see the
      // matching removal note in widgetLogin() above; the Host-vs-JWT
      // cross-check formerly here (checkWidgetBootstrapTenantScope()) is
      // removed for the same reason.
      const refreshTtlSeconds = this.authService.getWidgetSessionTtlSeconds();
      // Sliding expiration: every successful bootstrap rotates and re-arms
      // the cookie, so a receptionist using this terminal regularly never
      // sees the login form again unless the cookie is cleared or the
      // account's idle-timeout policy (enforced inside refreshToken()) fires.
      reply.setCookie(
        AuthController.WIDGET_COOKIE,
        result.refreshToken,
        this.widgetCookieOptions(refreshTtlSeconds),
      );
      return { accessToken: result.accessToken, user: result.user };
    } catch (err) {
      reply.clearCookie(AuthController.WIDGET_COOKIE, { path: AuthController.WIDGET_COOKIE_PATH });
      throw new UnauthorizedException({ error: 'NO_SESSION', message: 'Widget session expired. Please sign in again.' });
    }
  }

  // ── POST /api/v1/auth/widget-logout ─────────────────────────────────────────
  @Public()
  @Post('widget-logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear the widget session cookie for this browser/terminal' })
  async widgetLogout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const cookieValue = req.cookies?.[AuthController.WIDGET_COOKIE];
    if (cookieValue) {
      const payload = this.authService.decodeToken(cookieValue);
      if (payload?.jti) {
        await this.authService.blacklistJti(payload.jti, this.authService.getWidgetSessionTtlSeconds());
      }
    }
    reply.clearCookie(AuthController.WIDGET_COOKIE, { path: AuthController.WIDGET_COOKIE_PATH });
  }

  // -- POST /api/v1/auth/change-password -----------------------------------------
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Change authenticated user password' })
  @Audit({ action: 'PASSWORD_CHANGE_REQUEST', module: 'AUTH' })
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @Req() req: FastifyRequest,
  ) {
    const payload = this.extractPayload(req);
    await this.authService.changePassword(user.id, dto, payload.jti);
  }

  // -- GET /api/v1/auth/setup-required --------------------------------------------
  @Public()
  @Get('setup-required')
  @ApiOperation({ summary: 'Returns true when no SUPER_ADMIN exists yet for this tenant (first-run setup)' })
  async setupRequired(@Req() req: FastifyRequest & { tenantId?: string }) {
    return { required: await this.authService.isSetupRequired(req.tenantId) };
  }

  // -- POST /api/v1/auth/setup-superadmin -----------------------------------------
  @Public()
  @Post('setup-superadmin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'One-time setup: create the first SUPER_ADMIN account for this tenant' })
  @ApiResponse({ status: 201, description: 'Super admin created' })
  @ApiResponse({ status: 409, description: 'Super admin already exists' })
  async setupSuperAdmin(
    @Body() dto: { username: string; email: string; fullName?: string; password: string },
    @Req() req: FastifyRequest & { tenantId?: string },
  ) {
    return this.authService.setupSuperAdmin(dto, req.tenantId);
  }

  // -- POST /api/v1/auth/forgot-password -------------------------------------------
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit a password reset request. Always returns 200 to prevent username enumeration.' })
  @ApiResponse({ status: 200, description: 'Request submitted (or silently discarded)' })
  async forgotPassword(
    // ZoeConnect Identity Architecture Migration, Phase 7 follow-up:
    // `identifier` (username OR email, resolved globally/case-insensitively
    // -- see PasswordResetService.forgotPassword()) is now the preferred
    // field, mirroring LoginDto exactly. `username` is kept so the legacy
    // `{ username, reason }` request shape keeps working unmodified for any
    // caller that hasn't switched over yet.
    @Body() dto: { identifier?: string; username?: string; reason?: string },
    @Req() req: FastifyRequest,
  ) {
    const identifier = (dto.identifier ?? dto.username ?? '').trim();

    // Same "always 200, never reveal whether the account exists" posture as
    // an unknown identifier below -- an empty identifier is just another
    // case of "nothing to look up."
    if (!identifier) {
      return { message: 'If the account exists, a password reset request has been submitted.' };
    }

    const res = await this.passwordResetService.forgotPassword({
      identifier,
      reason:             dto.reason,
      requestedByIp:      (req.headers['x-forwarded-for'] as string) ?? req.ip ?? '',
      requestedUserAgent: (req.headers['user-agent'] as string) ?? '',
    });

    if (res && 'code' in res && res.code === 'INSTANCE_NOT_REGISTERED') {
      return res; // returns { code: 'INSTANCE_NOT_REGISTERED' }
    }

    if (res && 'requestType' in res && res.requestType === 'SUPERADMIN_TO_VENDOR') {
      this.vendorSyncService.notifyPasswordResetRequest({
        // The account's actual username (resolved server-side), not the raw
        // identifier the caller typed -- the vendor-side webhook contract
        // expects a username, and the caller may have typed an email.
        username: res.username,
        requestId: res.requestId,
        reason: dto.reason,
      }).catch(() => {});
    }
    return { message: 'If the account exists, a password reset request has been submitted.' };
  }

  // -- GET /api/v1/auth/password-reset-requests -------------------------------------
  // Stage B (Checkpoint B3.3) -- TenantContextInterceptor applied at the
  // method level only (not class level), since AuthController mixes many
  // public/login routes with this one sensitive admin route. Keeps blast
  // radius to exactly this endpoint.
  @Get('password-reset-requests')
  @UseInterceptors(TenantContextInterceptor)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List password reset requests (SUPER_ADMIN only)' })
  async listPasswordResetRequests(@CurrentUser() user: User) {
    if (!user.isSuperAdmin) throw new Error('Forbidden');
    return this.passwordResetService.listRequests();
  }

  // -- POST /api/v1/auth/password-reset-requests/:id/review -------------------------
  @Post('password-reset-requests/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Approve or reject a password reset request. Returns one-time password on approval.' })
  @ApiResponse({ status: 409, description: 'Request already processed' })
  @Audit({ action: 'PASSWORD_RESET_REVIEW', module: 'AUTH' })
  async reviewPasswordResetRequest(
    @Param('id') requestId: string,
    @CurrentUser() user: User,
    @Body() dto: { action: 'APPROVE' | 'REJECT'; note: string },
  ) {
    if (!user.isSuperAdmin) throw new Error('Forbidden');
    return this.passwordResetService.reviewRequest(requestId, user.id, dto);
  }

  private extractPayload(req: FastifyRequest): JwtPayload {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as JwtPayload;
  }
}
