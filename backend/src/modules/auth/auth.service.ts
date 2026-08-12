import {
  Injectable, UnauthorizedException, BadRequestException,
  ConflictException, ForbiddenException, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { InjectRedis } from '../../common/redis/redis.provider';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/entities/user.entity';
import { assertGlobalIdentityAvailable } from '../users/global-identity-conflict.util';
import { Role } from '../rbac/entities/role.entity';
import { AuditService } from '../audit/audit.service';
import { BranchService, DEFAULT_BRANCH_ID } from '../branch/branch.service';
import { PasswordResetService } from './password-reset.service';
import { ReferenceService } from '../his/reference/reference.service';
import { HisTokenBridgeService } from '../his/token/his-token-bridge.service';
import { UsersService } from '../users/users.service';
import { Tenant } from '../platform/tenant/entities/tenant.entity';
import { TenantContextService } from '../platform/tenant/tenant-context.service';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import { VendorSyncService } from '../licensing/vendor-sync.service';
import { CACHE_KEYS } from '../../config/redis.config';
import { AuthenticationProvider } from './enums/authentication-provider.enum';
import type { JwtPayload } from './strategies/jwt.strategy';
import type { LoginDto } from './dto/login.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const BCRYPT_ROUNDS = 12;

/**
 * Tenant-Scoped User Identity, Task 3 (login-flow redesign).
 *
 * `LOGIN_TENANT_SCOPE_MODE` — same staged-rollout shape as Task 8.3's
 * `TENANT_SCOPE_GUARD_MODE`, extended to a third state since this call site
 * needs a true no-op fallback in addition to observe/enforce:
 *
 *   - `legacy`   — pre-Task-3 behavior, byte-identical: a single global
 *     `username`-only lookup, no tenant-aware query ever runs. The
 *     emergency rollback value if `shadow`/`enforced` ever misbehaves.
 *   - `shadow`   — DEFAULT. Runs the legacy lookup (still authoritative --
 *     this is what's actually used to authenticate) AND a tenant-scoped
 *     lookup in parallel, purely to observe. Any disagreement between the
 *     two is logged (structured, `login_tenant_scope_mismatch`), never
 *     thrown. This is how real production evidence gets collected before
 *     anything can break a real login.
 *   - `enforced` — the tenant-scoped lookup becomes authoritative; the
 *     legacy lookup no longer runs at all. Only safe to flip once a real
 *     `shadow`-mode observation window has produced zero unexplained
 *     mismatches. This is the mode Task 5's composite unique constraints
 *     assume is already active.
 */
type LoginTenantScopeMode = 'legacy' | 'shadow' | 'enforced';

/**
 * ZoeConnect Identity Architecture Migration, Phase 3.
 *
 * `AUTH_IDENTITY_MODE` — a second, independent rollout flag layered on top
 * of `LoginTenantScopeMode` above, not a replacement for it:
 *
 *   - `legacy` (default) — `resolveLoginUser()`'s existing
 *     `LoginTenantScopeMode`-gated logic runs completely unchanged; the
 *     identifier passed in is treated strictly as a `username`, exactly as
 *     before this phase.
 *   - `global` — bypasses `LoginTenantScopeMode` entirely and does one
 *     case-insensitive lookup by `username` OR `email`, with no
 *     tenant/Host/subdomain involvement. Deliberately not composed with the
 *     tenant-scope modes above: those exist to stage the *username-only*
 *     lookup's transition to tenant-scoped, a concern this new path
 *     supersedes. Only safe to enable once Phase 4's global-uniqueness
 *     migration has run in that environment — before that, the same
 *     username/email can legitimately exist in more than one tenant, so
 *     `.getOne()` may return any one of several matching rows.
 */
type AuthIdentityMode = 'legacy' | 'global';

interface LoginUserResolution {
  user: User | null;
  mode: LoginTenantScopeMode | 'global';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Shared relations for both the legacy and tenant-aware login lookups --
  // kept as one constant so the two queries can never silently drift apart
  // in what they eager-load (which would itself produce a spurious mismatch
  // signal in shadow mode).
  private static readonly LOGIN_USER_RELATIONS = ['roles', 'roles.permissions'];

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectDataSource()      private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
    private readonly branchSvc: BranchService,
    private readonly passwordResetSvc: PasswordResetService,
    private readonly settingsService: SettingsService,
    private readonly referenceSvc: ReferenceService,
    private readonly hisTokenBridge: HisTokenBridgeService,
    private readonly usersSvc: UsersService,
    private readonly tenantContext: TenantContextService,
    @InjectRedis() private readonly redis: Redis,
    // Auto-register cloud tenants at first login (see login()'s call site
    // below) -- already available with no new module wiring, since
    // AuthModule imports LicensingModule (which exports VendorSyncService)
    // for SetupController's existing use.
    private readonly vendorSyncService: VendorSyncService,
  ) {}

  /** Reads + validates `LOGIN_TENANT_SCOPE_MODE`, falling back to the safe default (`shadow`) on an unrecognized value rather than crashing login for everyone. */
  private getLoginTenantScopeMode(): LoginTenantScopeMode {
    const raw = this.config.get<string>('LOGIN_TENANT_SCOPE_MODE', 'shadow');
    if (raw === 'legacy' || raw === 'shadow' || raw === 'enforced') return raw;
    this.logger.warn(
      `Invalid LOGIN_TENANT_SCOPE_MODE="${raw}" -- falling back to "shadow". Valid values: legacy | shadow | enforced.`,
    );
    return 'shadow';
  }

  /** Reads + validates `AUTH_IDENTITY_MODE`, falling back to the safe default (`legacy`) on an unrecognized value. See the `AuthIdentityMode` doc comment above for what each value does. */
  private getAuthIdentityMode(): AuthIdentityMode {
    const raw = this.config.get<string>('AUTH_IDENTITY_MODE', 'legacy');
    if (raw === 'legacy' || raw === 'global') return raw;
    this.logger.warn(
      `Invalid AUTH_IDENTITY_MODE="${raw}" -- falling back to "legacy". Valid values: legacy | global.`,
    );
    return 'legacy';
  }

  /**
   * The one place `username` -> `User` resolution happens for standard
   * (non-HIS) login. Shared between every mode so the actual lookup logic
   * is written once, not duplicated per branch -- only which query(ies) run
   * and which result wins differs.
   *
   * `requestTenantId` is `SubdomainTenantMiddleware`'s host-resolved value
   * (Task 8.2), threaded in from `AuthController.login()`'s `req.tenantId`.
   */
  private async resolveLoginUser(
    identifier: string,
    requestTenantId: string | null | undefined,
  ): Promise<LoginUserResolution> {
    // ZoeConnect Identity Architecture Migration, Phase 3 -- checked first
    // and returns immediately: AUTH_IDENTITY_MODE=global bypasses every
    // LoginTenantScopeMode branch below entirely (see AuthIdentityMode's
    // doc comment for why the two flags don't compose).
    if (this.getAuthIdentityMode() === 'global') {
      return this.resolveLoginUserGlobal(identifier);
    }

    const username = identifier;
    const mode = this.getLoginTenantScopeMode();

    if (mode === 'enforced') {
      // No legacy fallback in this mode -- an unresolved tenant means there
      // is nothing safe to authenticate against. Mirrors hisLogin()'s
      // identical Task 2 guard rather than silently degrading to a global
      // lookup, which is exactly the behavior enforced mode exists to
      // retire.
      if (!requestTenantId) {
        throw new UnauthorizedException('Unable to resolve tenant for this request');
      }
      const user = await this.userRepo.findOne({
        where: { username, tenantId: requestTenantId },
        relations: AuthService.LOGIN_USER_RELATIONS,
      });
      return { user, mode };
    }

    // legacy + shadow both need the legacy lookup -- it's the authoritative
    // result in both of those modes (shadow only *observes* the tenant-aware
    // query, it never acts on it).
    const legacyUser = await this.userRepo.findOne({
      where: { username },
      relations: AuthService.LOGIN_USER_RELATIONS,
    });

    if (mode === 'legacy' || !requestTenantId) {
      // Nothing to compare against in `legacy` mode, or no tenant was
      // resolvable at all (e.g. a background/system call site, or the rare
      // SubdomainTenantMiddleware internal-error fallback) -- skip the
      // second query rather than run a comparison that can't mean anything.
      return { user: legacyUser, mode };
    }

    const tenantAwareUser = await this.userRepo.findOne({
      where: { username, tenantId: requestTenantId },
      relations: AuthService.LOGIN_USER_RELATIONS,
    });

    const legacyUserId = legacyUser?.id ?? null;
    const tenantAwareUserId = tenantAwareUser?.id ?? null;
    if (legacyUserId !== tenantAwareUserId) {
      // Structured, single-line, machine-parseable -- this is the actual
      // evidence a real shadow-mode observation window depends on. Never
      // throws: shadow mode's entire point is that a mismatch is observed,
      // not acted on.
      this.logger.warn(JSON.stringify({
        event: 'login_tenant_scope_mismatch',
        mode,
        username,
        requestTenantId,
        legacyUserId,
        legacyUserTenantId: legacyUser?.tenantId ?? null,
        tenantAwareUserId,
      }));
    }

    return { user: legacyUser, mode };
  }

  /**
   * ZoeConnect Identity Architecture Migration, Phase 3 -- AUTH_IDENTITY_MODE
   * = 'global' path. Single case-insensitive lookup by username OR email, no
   * tenant/Host/subdomain involvement whatsoever.
   *
   * Built with `createQueryBuilder` (not `repo.findOne()`) for two reasons:
   * (1) a `LOWER(...)` comparison needs a raw `.where()` expression `findOne`'s
   * `where` object can't express, and (2) `User.roles`/`User.directPermissions`
   * are `eager: true` on the entity but eager-loading is a `find*`-only
   * behavior -- `createQueryBuilder` needs the same explicit joins
   * `JwtStrategy.validate()` already uses for this exact reason (see that
   * method's own doc comment on the TypeORM `distinctAlias` to-many-join bug
   * this sidesteps).
   */
  private async resolveLoginUserGlobal(identifier: string): Promise<LoginUserResolution> {
    const matchWhere = 'LOWER(user.username) = LOWER(:identifier) OR LOWER(user.email) = LOWER(:identifier)';

    // Safety net (production incident, 2026-08 -- "app.zoeconnect.in
    // resolves a different tenant than the website" investigation):
    // AUTH_IDENTITY_MODE=global's entire premise is that `username`/`email`
    // are GLOBALLY unique -- an invariant only actually enforced once
    // 1788500000000-GlobalIdentityUniqueness.ts's `UNIQUE (LOWER(username))`
    // / `UNIQUE (LOWER(email))` indexes exist in this database (that
    // migration's own doc comment: "production stays on
    // AUTH_IDENTITY_MODE=legacy until the rest of this migration is
    // complete and validated"). If AUTH_IDENTITY_MODE was ever flipped to
    // 'global' before that migration actually ran against this database --
    // or a duplicate was reintroduced by some other path afterward -- two
    // different `User` rows (e.g. one under the real hospital tenant, one
    // under some other seeded/demo tenant) can share the same identifier.
    // The previous implementation called `.getOne()` directly: TypeORM/
    // Postgres do not guarantee which of several matching rows `getOne()`
    // returns, so the SAME credentials could silently authenticate into a
    // DIFFERENT tenant's account from one login to the next -- exactly the
    // reported symptom, and nothing to do with Host/subdomain (this method
    // never reads either -- see resolveLoginUser()'s AUTH_IDENTITY_MODE
    // short-circuit above). Counting first and refusing to guess turns a
    // silent cross-tenant mismatch into a loud, diagnosable failure instead.
    const duplicateCount = await this.userRepo.createQueryBuilder('user')
      .where(matchWhere, { identifier })
      .getCount();

    if (duplicateCount > 1) {
      this.logger.error(
        `[AUTH-DIAG] resolveLoginUserGlobal(): identifier="${identifier}" matches ${duplicateCount} User rows -- ` +
        `global username/email uniqueness invariant is violated in this database. Refusing to pick one ` +
        `arbitrarily. Run "npm run verify:global-identity" (backend/src/scripts/verify-global-identity-uniqueness.ts) ` +
        `for the full list of affected users/tenants, then resolve every conflict before this identifier can log in again.`,
      );
      throw new UnauthorizedException('Invalid username or password');
    }

    const user = await this.userRepo.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'rolePermissions')
      .leftJoinAndSelect('user.directPermissions', 'directPermissions')
      .where(matchWhere, { identifier })
      .getOne();

    return { user, mode: 'global' };
  }

  // -- Login --
  // Tenant-Scoped User Identity, Task 3: `requestTenantId` is optional and
  // additive -- `AuthController.login()` now passes `req.tenantId`
  // (SubdomainTenantMiddleware), but every other existing caller/test that
  // omits it still gets exactly the pre-Task-3 `legacy`-equivalent behavior
  // for any mode that doesn't strictly require it (`legacy`/`shadow` with no
  // tenant simply skip the comparison; `enforced` without a tenant fails
  // closed -- see resolveLoginUser()).
  async login(dto: LoginDto, ipAddress: string, userAgent: string, requestTenantId?: string | null) {
    // ZoeConnect Identity Architecture Migration, Phase 3 -- `identifier` is
    // the preferred field (username or email); `dto.username` is kept as a
    // fallback so the legacy `{ username, password }` request shape keeps
    // working unmodified. LoginDto's `@ValidateIf` already guarantees at
    // least one of the two is present by the time a request reaches here;
    // the `?? ''` is just defensive for direct (non-HTTP) callers that
    // construct a LoginDto by hand and skip validation.
    const identifier = (dto.identifier ?? dto.username ?? '').trim();

    const authFailed = () =>
      new UnauthorizedException('Invalid username or password');

    if (!identifier) throw authFailed();

    const { user } = await this.resolveLoginUser(identifier, requestTenantId);
    if (!user) throw authFailed();
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated. Contact administrator.');
    if (user.isLocked) {
      throw new UnauthorizedException(
        `Account locked until ${user.lockedUntil?.toISOString()}. Too many failed attempts.`,
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      this.logger.error(`PASSWORD INVALID FOR USER ${identifier}. Passed password: '${dto.password}', Hash in DB: '${user.passwordHash}'`);
      await this.handleFailedLogin(user);
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        userId: undefined,
        entityType: 'user',
        entityId: user.id,
        ipAddress,
        userAgent,
      });
      throw authFailed();
    }

    await this.userRepo.update(user.id, {
      failedLoginCount: 0,
      lockedUntil: null as any,
      lastLoginAt: new Date(),
    });

    // Fetch branches: SUPER_ADMIN sees all branches, others see their assigned ones
    let userBranches: { id: string; name: string }[] = [];
    const isSuperAdmin = user.roles?.some((r) => r.name === 'SUPER_ADMIN') ?? false;
    try {
      userBranches = isSuperAdmin
        ? await this.branchSvc.findAll()
        : await this.branchSvc.getUserBranches(user.id);
    } catch {
      // Non-fatal -- branch feature degrades gracefully when Oracle is unavailable
    }

    // SUPER_ADMIN fallback: if Oracle is down and no branches loaded, return the default branch
    // so the BranchSwitcher always renders for super admins.
    if (isSuperAdmin && userBranches.length === 0) {
      userBranches = [{ id: DEFAULT_BRANCH_ID, name: 'Default Branch' }];
    }

    // Auto-select if exactly one branch
    const activeBranchId = userBranches.length === 1 ? userBranches[0].id : null;

    const tokens = await this.generateTokens(user, activeBranchId);

    // Auto-register cloud tenants with the vendor at first login (explicit
    // product decision: cloud tenants are provisioned via the Vendor
    // Portal's URL + temporary password flow, not via the self-hosted
    // interactive "Register to Vendor" form, so registration has to happen
    // implicitly the first time that user actually logs in). Strictly
    // gated to cloud mode -- self-hosted's login path is completely
    // unaffected, this whole block never runs there. Never allowed to
    // fail a login: any error here is logged and swallowed, matching the
    // non-fatal-side-effect pattern used elsewhere (branch fetch above,
    // LicenseService's boot-time cache clear).
    if (this.config.get<string>('deployment.mode', 'self_hosted') === 'cloud' && user.tenantId) {
      try {
        const tenant = await this.tenantRepo.findOne({ where: { id: user.tenantId } });
        if (tenant) {
          await TenantContextStorage.run(user.tenantId, () =>
            this.vendorSyncService.autoRegisterCloudTenant(tenant.name, tenant.code),
          );
        }
      } catch (err) {
        this.logger.warn(`Cloud tenant auto-registration at login failed (non-fatal): ${(err as Error).message}`);
      }
    }

    await this.auditService.log({
      action: 'LOGIN_SUCCESS',
      module: 'AUTH',
      userId: user.id,
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      user: { ...this.sanitizeUser(user), branches: userBranches, activeBranchId },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // -- HIS Login --
  // Tenant-Scoped User Identity, Task 2: `tenantId` is now required, threaded
  // from `AuthController.hisLogin()`'s `req.tenantId` (set ambiently by
  // `SubdomainTenantMiddleware` on every request), and passed into
  // `findByHisEmployeeCode()` below so this auto-login path can no longer
  // match a HIS employee code belonging to a different tenant.
  async hisLogin(dto: { hisUsername: string; hisBranchId: string; hisDepartmentId: string; hisServiceCenterId: string; hisDepartmentName?: string; hisServiceCenterName?: string }, ipAddress: string, userAgent: string, tenantId?: string) {
    // SubdomainTenantMiddleware sets req.tenantId on every request except
    // its own internal-error fallback path (logged there as a warning).
    // Fail loudly here rather than silently running an unscoped lookup --
    // the entire point of Task 2 is that this method must never again match
    // a HIS employee code without a real tenant to scope it to.
    if (!tenantId) {
      throw new UnauthorizedException('Unable to resolve tenant for this request');
    }

    // Trim everything HIS sends. HIS extracts these values from JSF EL-rendered
    // DOM text (e.g. via jQuery .text()), which commonly carries leading/
    // trailing whitespace or newlines from the surrounding markup. That
    // whitespace survives into the JWT untouched, so activeDepartmentId later
    // fails a strict String(d.departmentId) === selectedDeptId comparison
    // against the clean value Oracle returns -- even when the correct
    // department/service center IS present in the fetched list. Trimming here,
    // once, at ingestion is simpler than defending every downstream comparison.
    // Trim everything HIS sends -- cheap insurance against whitespace from
    // JSF DOM extraction, even though it wasn't the cause of the department/
    // service-center display bug (confirmed via debug logging: raw values
    // arrive clean, e.g. hisDepartmentId="59").
    const hisUsername = dto.hisUsername?.trim();
    const hisBranchId = dto.hisBranchId?.trim();
    const hisDepartmentId = dto.hisDepartmentId?.trim();
    const hisServiceCenterId = dto.hisServiceCenterId?.trim();
    const hisDepartmentName = dto.hisDepartmentName?.trim();
    const hisServiceCenterName = dto.hisServiceCenterName?.trim();

    // 1. Fetch HIS user context
    const hisUserContext = await this.referenceSvc.getUserContext(hisUsername);
    if (!hisUserContext || !hisUserContext.employeeCode) {
      throw new UnauthorizedException('HIS user not found or has no employee code');
    }

    // 2. Fetch mapped ZoeConnect user
    const user = await this.usersSvc.findByHisEmployeeCode(hisUserContext.employeeCode, tenantId);
    if (!user) {
      throw new UnauthorizedException(`No ZoeConnect user mapped to this HIS employee (Employee Code: ${hisUserContext.employeeCode})`);
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated. Contact administrator.');
    }

    // Ensure they have token permissions
    const permissions = [
      ...(user.roles?.flatMap(r => r.permissions?.map(p => p.key) ?? []) ?? []),
      ...(user.directPermissions?.map(p => p.key) ?? [])
    ];
    const hasTokenPermission = permissions.some(p => p.startsWith('TOKEN:'));
    if (!hasTokenPermission) {
      throw new ForbiddenException('User lacks token module permissions');
    }

    // Fetch branches and validate branch access
    let userBranches: { id: string; name: string }[] = [];
    const isSuperAdmin = user.roles?.some((r) => r.name === 'SUPER_ADMIN') ?? false;
    try {
      userBranches = isSuperAdmin
        ? await this.branchSvc.findAll()
        : await this.branchSvc.getUserBranches(user.id);
    } catch {
      // Non-fatal
    }
    
    const branchMatched = userBranches.find(b => b.id === hisBranchId);
    if (!branchMatched && !isSuperAdmin) {
      throw new UnauthorizedException(`User does not have access to HIS branch ${hisBranchId}`);
    }

    // Note: We bypass Oracle validation for Department and Service Center.
    // The values were extracted directly from the authenticated HIS DOM,
    // so they are guaranteed to be valid in the HIS context. 
    // This prevents login failures if HIS table config or Oracle is unavailable.
    const deptMatched = true;
    const scMatched = true;

    const tokens = await this.generateTokens(user, hisBranchId, hisDepartmentId, hisServiceCenterId, true, hisDepartmentName, hisServiceCenterName);

    await this.auditService.log({
      action: 'LOGIN_SUCCESS',
      module: 'AUTH',
      userId: user.id,
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
      metadata: {
        integration: 'HIS_AUTO_LOGIN',
        hisUsername,
        mappedEmployeeCode: hisUserContext.employeeCode,
        hisBranchId,
        hisDepartmentId,
        hisServiceCenterId
      }
    });

    return {
      user: { 
        ...this.sanitizeUser(user), 
        branches: userBranches, 
        activeBranchId: hisBranchId,
        activeDepartmentId: hisDepartmentId,
        activeServiceCenterId: hisServiceCenterId,
        activeDepartmentName: hisDepartmentName ?? null,
        activeServiceCenterName: hisServiceCenterName ?? null,
        isHisIntegration: true
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // -- Logout --
  async logout(userId: string, jti: string, ipAddress: string, reason?: string, tenantId?: string, userAgent?: string) {
    const accessExpiresIn = this.config.get<string>('jwt.expiresIn', '15m');
    const ttlSeconds = this.parseTtl(accessExpiresIn);
    await this.redis.setex(CACHE_KEYS.JWT_BLACKLIST(jti), ttlSeconds, '1');

    await this.auditService.log({
      action: 'LOGOUT',
      module: 'AUTH',
      userId,
      ipAddress,
      tenantId,
      metadata: { 
        reason: reason ?? 'MANUAL', 
        sessionId: jti, 
        authenticationProvider: AuthenticationProvider.LOCAL,
        userAgent
      },
    });
  }

  // -- Refresh Token --
  async refreshToken(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const isBlacklisted = await this.redis.exists(CACHE_KEYS.JWT_BLACKLIST(payload.jti));
    if (isBlacklisted) throw new UnauthorizedException('Token revoked');

    // Check Idle Session Timeout (Enforced during refresh)
    //
    // Fix (2026-07-20, real incident): getSettings() used to read a
    // globally-shared system_settings row with no tenant filter at all --
    // one tenant's idle-timeout config silently applied to every other
    // tenant's sessions (see SettingsService's doc comment). This route is
    // @Public() (no ambient TenantContextInterceptor context), but the
    // refresh token's own JWT payload already carries the tenant it was
    // issued for (payload.tenantId, stamped by generateTokens()) -- no
    // extra plumbing needed, just read it directly off the already-verified
    // token instead of relying on ambient context that doesn't exist here.
    const settings = await this.settingsService.getSettings(payload.tenantId);
    const timeoutVal = settings['security.idleTimeoutMinutes'];
    const timeoutMinutes = timeoutVal ? parseInt(timeoutVal, 10) : 0;

    if (timeoutMinutes > 0) {
      const isActive = await this.redis.exists(CACHE_KEYS.SESSION_ACTIVITY(payload.jti));
      if (!isActive) {
        throw new UnauthorizedException('Session expired due to inactivity');
      }
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub, isActive: true },
      relations: ['roles', 'roles.permissions'],
    });
    if (!user) throw new UnauthorizedException('User not found');

    const tokens = await this.generateTokens(user, payload.activeBranchId ?? null);
    await this.redis.setex(
      CACHE_KEYS.JWT_BLACKLIST(payload.jti),
      this.parseTtl(this.config.get<string>('jwt.refreshExpiresIn', '7d')),
      '1',
    );

    return { user: this.sanitizeUser(user), ...tokens };
  }

  // -- Registration Widget: self-bootstrap from httpOnly cookie ---------------
  /**
   * Used exclusively by the ZoeConnect Registration widget iframe (see
   * AuthController.widgetLogin/widgetBootstrap/widgetLogout). The widget is
   * embedded in HIS with NO query parameters and NO HIS-supplied credentials
   * of any kind -- on load it calls this indirectly (via the controller,
   * which reads the httpOnly cookie) to obtain its own short-lived access
   * token plus the receptionist's assigned branch(es), exactly as the main
   * ZoeConnect SPA would after a normal login.
   *
   * Deliberately built on top of the existing refreshToken() (idle-timeout
   * enforcement, blacklist-and-rotate) rather than a parallel code path, so
   * this flow inherits the same session-expiry policy as every other client
   * -- there is no separate, weaker "widget session" concept.
   */
  async widgetBootstrap(cookieRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: ReturnType<AuthService['sanitizeUser']> & {
      branches: { id: string; name: string }[];
      activeBranchId: string | null;
    };
  }> {
    const { accessToken, refreshToken } = await this.refreshToken(cookieRefreshToken);

    const payload = this.jwtService.decode(accessToken) as JwtPayload | null;
    const fullUser = await this.userRepo.findOne({
      where: { id: payload?.sub },
      relations: ['roles', 'roles.permissions'],
    });
    if (!fullUser) throw new UnauthorizedException('User not found');

    const profile = await this.getProfile(fullUser, payload?.activeBranchId ?? null);

    return { accessToken, refreshToken, user: profile as any };
  }

  // -- Select / Switch Active Branch --
  async selectBranch(
    userId: string,
    branchId: string,
    currentJti: string,
  ): Promise<{ accessToken: string; activeBranchId: string }> {
    const user = await this.userRepo.findOne({
      where: { id: userId, isActive: true },
      relations: ['roles', 'roles.permissions'],
    });
    if (!user) throw new UnauthorizedException('User not found');

    // SUPER_ADMIN can switch to any branch; others must be explicitly assigned
    const isSuperAdmin = user.roles?.some((r) => r.name === 'SUPER_ADMIN') ?? false;
    if (!isSuperAdmin) {
      const hasAccess = await this.branchSvc.validateUserBranch(userId, branchId);
      if (!hasAccess) {
        throw new ForbiddenException(`You do not have access to branch ${branchId}`);
      }
    }

    const accessTtl = this.parseTtl(this.config.get<string>('jwt.expiresIn', '15m'));
    await this.redis.setex(CACHE_KEYS.JWT_BLACKLIST(currentJti), accessTtl, '1');

    const { accessToken } = await this.generateTokens(user, branchId);

    await this.auditService.log({
      action: 'BRANCH_SELECTED',
      module: 'AUTH',
      userId,
      entityType: 'user',
      entityId: userId,
      newValue: { branchId },
    });

    return { accessToken, activeBranchId: branchId };
  }

  // -- Widget Token Renewal --------------------------------------------------
  /**
   * Mints a fresh, short-lived access token for an already-authenticated widget
   * session (e.g. the HIS-embedded Registration widget iframe), WITHOUT requiring
   * a refresh token or a second login.
   *
   * Security model:
   *   - Caller must already hold a valid, non-expired, non-blacklisted access
   *     token (enforced by JwtAuthGuard on the controller route).
   *   - The presented token's jti is immediately blacklisted (rotation) so a
   *     leaked/observed widget token cannot be replayed after renewal.
   *   - No new privileges are granted -- roles/branch carry over unchanged.
   *   - Only an access token is returned; no refresh token is issued to the
   *     widget, since the widget has no persistent storage and should never
   *     hold a long-lived credential.
   */
  async renewWidgetToken(
    userId: string,
    currentJti: string,
    activeBranchId: string | null,
  ): Promise<{ accessToken: string; expiresIn: string }> {
    const user = await this.userRepo.findOne({
      where: { id: userId, isActive: true },
      relations: ['roles', 'roles.permissions'],
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.isLocked) throw new UnauthorizedException('Account is temporarily locked');

    const accessTtl = this.parseTtl(this.config.get<string>('jwt.expiresIn', '15m'));
    await this.redis.setex(CACHE_KEYS.JWT_BLACKLIST(currentJti), accessTtl, '1');

    const { accessToken } = await this.generateTokens(user, activeBranchId);

    await this.auditService.log({
      action: 'WIDGET_TOKEN_RENEWED',
      module: 'AUTH',
      userId,
      entityType: 'user',
      entityId: userId,
    });

    return {
      accessToken,
      expiresIn: this.config.get<string>('jwt.expiresIn', '15m'),
    };
  }

  // -- Change Password --
  async changePassword(userId: string, dto: ChangePasswordDto, currentJti: string) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from current password');
    }

    const hash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.userRepo.update(userId, {
      passwordHash: hash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    });

    const ttl = this.parseTtl(this.config.get<string>('jwt.expiresIn', '15m'));
    await this.redis.setex(CACHE_KEYS.JWT_BLACKLIST(currentJti), ttl, '1');

    await this.auditService.log({
      action: 'PASSWORD_CHANGED',
      module: 'AUTH',
      userId,
      entityType: 'user',
      entityId: userId,
    });

    // Transition any approved reset request to COMPLETED
    await this.passwordResetSvc.markCompleted(userId);
  }

  // -- Profile (enriched with branches) --
  //
  // activeDepartmentId/activeServiceCenterId/isHisIntegration were being decoded
  // from the JWT in the controller's extractPayload() call but never actually
  // reached the response -- only activeBranchId was forwarded. The frontend's
  // SCJoinPanel (app/(platform)/token/page.tsx) already reads
  // user.activeDepartmentId/activeServiceCenterId to pre-select the HIS-passed
  // department/service center, and user.isHisIntegration to lock those dropdowns
  // once auto-logged-in -- that logic was fully built and simply never received
  // real values, so a HIS auto-login always landed on the fully-manual join
  // panel instead of the auto-selected/locked one. See AuthProvider.tsx's SSO
  // token flow: it always re-fetches this profile after consuming ?ssoToken=,
  // never uses hisLogin()'s own response body (that response is consumed
  // entirely by the HIS page's own JS, only the accessToken survives into the
  // iframe URL) -- so this endpoint is the only place these values can flow
  // from the JWT into the frontend's auth store.
  async getProfile(
    user: User,
    activeBranchId?: string | null,
    activeDepartmentId?: string | null,
    activeServiceCenterId?: string | null,
    isHisIntegration?: boolean,
    activeDepartmentName?: string | null,
    activeServiceCenterName?: string | null,
  ) {
    let branches: { id: string; name: string }[] = [];
    const isSuperAdmin = user.roles?.some((r) => r.name === 'SUPER_ADMIN') ?? false;
    try {
      branches = isSuperAdmin
        ? await this.branchSvc.findAll()
        : await this.branchSvc.getUserBranches(user.id);
    } catch { /* non-fatal */ }

    // Fallback: SUPER_ADMIN always gets at least the default branch
    if (isSuperAdmin && branches.length === 0) {
      branches = [{ id: DEFAULT_BRANCH_ID, name: 'Default Branch' }];
    }

    return {
      ...this.sanitizeUser(user),
      branches,
      activeBranchId: activeBranchId ?? null,
      activeDepartmentId: activeDepartmentId ?? null,
      activeServiceCenterId: activeServiceCenterId ?? null,
      activeDepartmentName: activeDepartmentName ?? null,
      activeServiceCenterName: activeServiceCenterName ?? null,
      isHisIntegration: isHisIntegration ?? false,
    };
  }

  async getSessionContext(
    user: User,
    activeBranchId?: string | null,
    activeDepartmentId?: string | null,
    activeServiceCenterId?: string | null,
    isHisIntegration?: boolean,
    activeDepartmentName?: string | null,
    activeServiceCenterName?: string | null,
  ) {
    const profile = await this.getProfile(user, activeBranchId, activeDepartmentId, activeServiceCenterId, isHisIntegration, activeDepartmentName, activeServiceCenterName);
    
    let idleTimeoutMinutes = 60; // DEFAULT_IDLE_TIMEOUT
    try {
      const settings = await this.settingsService.getSettings(user.tenantId);
      const val = settings['security.idleTimeoutMinutes'];
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed)) {
          idleTimeoutMinutes = Math.max(5, Math.min(1440, parsed));
        }
      }
    } catch { /* use default */ }

    const deploymentMode = this.config.get<string>('DEPLOYMENT_MODE', 'self_hosted');
    const websiteLoginUrl = this.config.get<string>('WEBSITE_LOGIN_URL', '');
    const appLoginUrl = this.config.get<string>('APP_LOGIN_URL', '');

    return {
      user: profile,
      tenant: {
        id: user.tenantId,
        // Optional properties depending on frontend needs, keeping it lean for now
      },
      session: {
        idleTimeoutMinutes,
        deploymentMode,
        authenticationProvider: AuthenticationProvider.LOCAL,
        websiteLoginUrl,
        appLoginUrl,
      },
    };
  }

  async getSessionHealth(user: User, jti: string) {
    let idleTimeoutMinutes = 60;
    try {
      const settings = await this.settingsService.getSettings(user.tenantId);
      const val = settings['security.idleTimeoutMinutes'];
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed)) idleTimeoutMinutes = Math.max(5, Math.min(1440, parsed));
      }
    } catch { /* use default */ }

    // Retrieve TTL from redis based on blacklisting/expiry or activity
    const activityTtl = await this.redis.ttl(CACHE_KEYS.SESSION_ACTIVITY(jti));
    
    return {
      authenticated: true,
      deploymentMode: this.config.get<string>('DEPLOYMENT_MODE', 'self_hosted'),
      authenticationProvider: AuthenticationProvider.LOCAL,
      idleTimeoutMinutes,
      sessionExpiresIn: activityTtl > 0 ? activityTtl : 0
    };
  }

  // ── Session Activity ────────────────────────────────────────────────────────
  // Fix (2026-07-20): tenantId now threaded through explicitly (from the
  // caller's already-authenticated User entity, or generateTokens()'s
  // freshly-created one) rather than SettingsService silently reading a
  // globally-shared config row -- see SettingsService's doc comment.
  async recordActivity(userId: string, jti: string, tenantId?: string | null) {
    const settings = await this.settingsService.getSettings(tenantId);
    const timeoutVal = settings['security.idleTimeoutMinutes'];
    const timeoutMinutes = timeoutVal ? parseInt(timeoutVal, 10) : 0;
    
    if (timeoutMinutes > 0) {
      const timeoutSeconds = timeoutMinutes * 60;
      await this.redis.setex(CACHE_KEYS.SESSION_ACTIVITY(jti), timeoutSeconds, 'active');
    }
  }

  /**
   * Phase 8 (Task 8.1) — resolves `Tenant.code` for the JWT's `tenantSlug`
   * claim. Small in-memory cache (id -> code), same rationale as
   * `TenantContextService`'s own caching: the tenant-row set is tiny and
   * effectively static between deployments, so a per-login DB round trip
   * isn't warranted once warmed. Returns `null` (not a throw) when
   * `tenantId` is null/unresolvable -- a user with no tenant assigned
   * (legacy row predating Stage A's backfill) still logs in; the JWT
   * simply carries no tenant claims, exactly like a pre-Phase-8 token.
   */
  private readonly tenantCodeCache = new Map<string, string>();
  private async resolveTenantSlug(tenantId: string | null | undefined): Promise<string | null> {
    if (!tenantId) return null;
    const cached = this.tenantCodeCache.get(tenantId);
    if (cached) return cached;
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) return null;
    this.tenantCodeCache.set(tenantId, tenant.code);
    return tenant.code;
  }

  // -- Helpers --
  private async generateTokens(user: User, activeBranchId?: string | null, activeDepartmentId?: string | null, activeServiceCenterId?: string | null, isHisIntegration: boolean = false, activeDepartmentName?: string | null, activeServiceCenterName?: string | null) {
    const permissions = Array.from(
      new Set([
        ...(user.roles?.flatMap((r) => r.permissions?.map((p) => p.key) ?? []) ?? []),
        ...(user.directPermissions?.map((p) => p.key) ?? []),
      ]),
    );

    const jti = uuidv4();
    const tenantSlug = await this.resolveTenantSlug(user.tenantId);

    const payload: JwtPayload = {
      sub: user.id,
      jti,
      username: user.username,
      hisEmployeeCode: user.hisEmployeeCode,
      roles: user.roles?.map((r) => r.name) ?? [],
      activeBranchId,
      activeDepartmentId,
      activeServiceCenterId,
      activeDepartmentName,
      activeServiceCenterName,
      isHisIntegration,
      tenantId: user.tenantId ?? null,
      // ZoeConnect Identity Architecture Migration, Phase 2 -- additive
      // alias of tenantId (see JwtPayload.organizationId's doc comment in
      // strategies/jwt.strategy.ts). Always the same value as tenantId
      // above; nothing downstream reads it yet.
      organizationId: user.tenantId ?? null,
      tenantSlug,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.config.get<string>('jwt.expiresIn', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiresIn', '7d'),
      }),
    ]);

    // Record initial activity
    await this.recordActivity(user.id, jti, user.tenantId);

    return { accessToken, refreshToken };
  }

  private async handleFailedLogin(user: User) {
    const count = (user.failedLoginCount ?? 0) + 1;
    const update: Partial<User> = { failedLoginCount: count };

    if (count >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCK_DURATION_MINUTES);
      update.lockedUntil = lockedUntil;
      this.logger.warn(`Account locked: ${user.username} (${count} failed attempts)`);
    }

    await this.userRepo.update(user.id, update);
  }

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      hisEmployeeCode: user.hisEmployeeCode,
      roles: user.roles?.map((r) => ({ id: r.id, name: r.name })) ?? [],
      permissions: user.permissionKeys,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
    };
  }

  // -- One-time Super Admin Setup --
  // Phase 8 (Task 8.4): scoped per-tenant rather than globally-once -- a
  // second hospital onboarding onto the same ZoeConnect instance must still be
  // able to bootstrap its own first SUPER_ADMIN, even though tenant #1
  // already has one. `tenantId` is `SubdomainTenantMiddleware`'s
  // host-resolved value (Task 8.2).
  //
  // Null-vs-default equivalence: every pre-Phase-8 user row originally had
  // `tenantId: null` (the column existed but was never stamped until B6).
  // Tenant-Scoped User Identity, Task 5 backfilled every such row (Task 1)
  // and made `users.tenant_id`/`roles.tenant_id` `NOT NULL` at the DB level
  // -- a real, live `NULL` `u.tenantId` row can no longer exist in this
  // table, so `OR u.tenantId IS NULL` below is retained purely as defense
  // (e.g. against a database that somehow predates the Task 5 migration,
  // or manual tampering), not because it is expected to match anything in
  // normal operation. `SubdomainTenantMiddleware` resolves a self-hosted
  // request's `req.tenantId` to the seeded 'default' tenant's real UUID, so
  // the two are already the same value post-Task-5 -- this equivalence
  // check is a no-op in the common case, just no longer load-bearing.
  async isSetupRequired(tenantId?: string | null): Promise<boolean> {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.roles', 'r')
      .where('r.name = :name', { name: 'SUPER_ADMIN' });

    if (tenantId) {
      const defaultTenantId = await this.tenantContext.getCurrentTenantId().catch(() => null);
      if (defaultTenantId && tenantId === defaultTenantId) {
        qb.andWhere('(u.tenantId = :tenantId OR u.tenantId IS NULL)', { tenantId });
      } else {
        qb.andWhere('u.tenantId = :tenantId', { tenantId });
      }
    } else {
      qb.andWhere('u.tenantId IS NULL');
    }
    const count = await qb.getCount();
    return count === 0;
  }

  async setupSuperAdmin(dto: {
    username: string;
    email:    string;
    fullName?: string;
    password: string;
  }, tenantId?: string | null): Promise<{ id: string; username: string; email: string; role: string }> {
    const required = await this.isSetupRequired(tenantId);
    if (!required) {
      throw new ConflictException(
        'Super admin already exists. Use the Users module to manage accounts.',
      );
    }

    const role = await this.roleRepo.findOne({ where: { name: 'SUPER_ADMIN' } });
    if (!role) {
      throw new BadRequestException(
        'SUPER_ADMIN role not found. Ensure database migrations have run.',
      );
    }

    // Tenant-Scoped User Identity, Task 5: `users.tenant_id` is now
    // `NOT NULL` at the DB level, so this can no longer stamp `null` for
    // the default-tenant case the way it did pre-Task-5 (that was a
    // "null-vs-default equivalence" convention for matching pre-Phase-8
    // legacy rows, which itself is now retired -- see isSetupRequired()'s
    // updated comment). Always resolve and stamp a real tenant UUID: the
    // caller's `tenantId` if it names a real, non-default tenant, otherwise
    // the seeded 'default' tenant's own UUID. Computed here (moved up from
    // below Task 4) so the duplicate-check immediately below can use it.
    const defaultTenantId = await this.tenantContext.getCurrentTenantId().catch(() => null);
    const stampedTenantId = tenantId && tenantId !== defaultTenantId ? tenantId : defaultTenantId;
    if (!stampedTenantId) {
      // Only reachable if the seeded 'default' tenant itself is missing
      // from this database -- a broken/incomplete install, not a normal
      // runtime condition. Fail loudly rather than attempt a NOT NULL
      // insert that Postgres would reject anyway with a less actionable
      // error.
      throw new BadRequestException(
        'Unable to resolve a tenant for super admin setup -- the seeded "default" tenant was not found. Ensure database migrations and seeding have run.',
      );
    }

    // ZoeConnect Identity Architecture Migration, Phase 4.1: global,
    // case-insensitive duplicate check (see
    // global-identity-conflict.util.ts's doc comment) -- replaces the
    // former `tenantId: stampedTenantId`-scoped check, which predates
    // Phase 4's DB constraint becoming global and would let a genuine
    // cross-tenant collision bypass this check and hit the unique index at
    // save() time instead, surfacing as a raw Postgres 23505 rather than
    // this ConflictException.
    await assertGlobalIdentityAvailable(this.userRepo, { username: dto.username, email: dto.email });

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      username:           dto.username,
      email:              dto.email,
      fullName:           dto.fullName ?? null,
      passwordHash,
      roles:              [role],
      isActive:           true,
      mustChangePassword: false,
      tenantId:           stampedTenantId,
    });
    const saved = await this.userRepo.save(user);

    // Fix (2026-07-20, real incident -- MOSC's freshly-created cloud super
    // admin showed "0 accounts" on their own Users page). UsersService
    // .findAll()'s branch-scoping (deliberately applies "even to
    // SUPER_ADMIN", see that method's doc comment) innerJoins user_branches
    // against the JWT's activeBranchId -- which login() sets to the
    // synthetic DEFAULT_BRANCH_ID ('Default Branch') for a SUPER_ADMIN
    // with zero real Oracle branches, purely as an in-memory display
    // fallback, with no corresponding user_branches ROW ever created. That
    // innerJoin then requires a real row that was never written, silently
    // excluding the super admin from their own tenant's user list -- for
    // any deployment with no Oracle HIS integration at all (every cloud
    // tenant today), not just MOSC. Only acts when branchSvc.findAll()
    // itself returns zero real branches (Oracle down/unconfigured) --
    // self-hosted with a real, reachable Oracle HIS is completely
    // unaffected, since DEFAULT_BRANCH_ID would then not match this
    // deployment's real branch numbering and must never be silently
    // granted as if it were. Non-fatal: never blocks account creation.
    try {
      const branches = await this.branchSvc.findAll();
      // Bug fix (2026-07-20, discovered while investigating the same "0
      // accounts" symptom recurring for a newly provisioned cloud tenant
      // "almas" -- this exact guard was already added once for MOSC and
      // still didn't fire). BranchService.findAll() never actually returns
      // an empty array when Oracle is down/unconfigured -- it returns a
      // synthetic ONE-element array `[{ id: DEFAULT_BRANCH_ID, name:
      // 'Default Branch' }]` (see that method's own fallback branch). So
      // `branches.length === 0` was never true for the exact case this
      // code exists to handle, and assignBranches() silently never ran for
      // any cloud tenant (or any self-hosted deployment with no reachable
      // Oracle at setup time) -- this is why the first fix appeared
      // correct in review but was a no-op at runtime. Detect the synthetic
      // fallback by shape instead of by length: a real Oracle branch list
      // would never happen to be exactly this one synthetic id/name pair.
      const isSyntheticFallback =
        branches.length === 0 ||
        (branches.length === 1 && branches[0].id === DEFAULT_BRANCH_ID && branches[0].name === 'Default Branch');
      if (isSyntheticFallback) {
        await this.branchSvc.assignBranches(saved.id, [DEFAULT_BRANCH_ID], saved.id);
      }
    } catch (err) {
      this.logger.warn(`Could not grant default branch membership to new super admin ${saved.username} (non-fatal): ${(err as Error).message}`);
    }

    this.logger.warn(`Super admin account created: ${saved.username} (${saved.email})`);

    await this.auditService.log({
      action:     'SUPER_ADMIN_SETUP',
      module:     'AUTH',
      userId:     saved.id,
      entityType: 'user',
      entityId:   saved.id,
          newValue:   { username: saved.username, email: saved.email },
    });

    return { id: saved.id, username: saved.username, email: saved.email, role: 'SUPER_ADMIN' };
  }

  private parseTtl(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 900;
    const val = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return val * (multipliers[unit] ?? 60);
  }

  // -- Small public helpers used by AuthController's widget-* endpoints -------
  // (kept here rather than duplicated/reimplemented in the controller, which
  // should stay a thin HTTP layer with no JWT/TTL logic of its own).

  /** How long the widget's httpOnly session cookie should live -- mirrors jwt.refreshExpiresIn. */
  getWidgetSessionTtlSeconds(): number {
    return this.parseTtl(this.config.get<string>('jwt.refreshExpiresIn', '7d'));
  }

  /** Decodes (does NOT verify) a JWT -- used only to read a jti for best-effort blacklisting on logout. */
  decodeToken(token: string): JwtPayload | null {
    try {
      return this.jwtService.decode(token) as JwtPayload;
    } catch {
      return null;
    }
  }

  /** Blacklists a jti for the given TTL. Idempotent; safe to call with an already-blacklisted or unknown jti. */
  async blacklistJti(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti || ttlSeconds <= 0) return;
    await this.redis.setex(CACHE_KEYS.JWT_BLACKLIST(jti), ttlSeconds, '1');
  }

  /**
   * NO LONGER CALLED (ZoeConnect Identity Architecture Migration, Phase 5)
   * -- AuthController's widgetLogin()/widgetBootstrap() no longer invoke
   * checkWidgetLoginTenantScope()/checkWidgetBootstrapTenantScope() below.
   * Kept, unused, for reference/rollback alongside TenantScopeGuard itself
   * (see that class's own doc comment for the full rationale -- this was
   * the identical Host-vs-JWT cross-check, reimplemented here only because
   * widget-* routes are `@Public()` and never reach that guard).
   *
   * Original doc comment follows:
   *
   * Phase 8 (Task 8.5) -- the widget's httpOnly session cookie never passes
   * through `TenantScopeGuard`: every widget-* route is `@Public()` (the
   * widget iframe carries no bearer token, only the cookie), and the guard
   * returns `true` immediately for any `@Public()` route before it ever
   * looks at extracting/verifying a token. That means the one long-lived,
   * silently-self-renewing session in this codebase (a receptionist
   * terminal's widget-bootstrap cookie, re-used across many days) is
   * exactly the session type Task 8.3's cross-tenant check was built for,
   * yet structurally can't reach. This is the same check, reimplemented at
   * the one call site the guard cannot cover -- same rollout mode
   * (`TENANT_SCOPE_GUARD_MODE`), same log-only-by-default behavior.
   */
  private assertTenantScope(
    tokenTenantId: string | null | undefined,
    requestTenantId: string | null | undefined,
    actorLabel: string,
  ): void {
    if (!tokenTenantId || !requestTenantId || tokenTenantId === requestTenantId) return;
    const mode = this.config.get<string>('TENANT_SCOPE_GUARD_MODE', 'log-only');
    this.logger.warn(
      `Tenant scope mismatch (widget flow): token tenantId=${tokenTenantId} vs. resolved request tenantId=${requestTenantId} -- ${actorLabel} -- mode=${mode}`,
    );
    if (mode === 'enforced') {
      throw new ForbiddenException('This account is not authorized for this tenant.');
    }
  }

  // -- Widget flow: tenant-scope check entry points ---------------------------
  // Thin wrappers so AuthController doesn't need to decode JWTs itself --
  // called after login()/widgetBootstrap() with the caller-resolved
  // req.tenantId (SubdomainTenantMiddleware, Task 8.2).
  checkWidgetLoginTenantScope(accessToken: string, requestTenantId: string | null | undefined): void {
    const payload = this.decodeToken(accessToken);
    this.assertTenantScope(payload?.tenantId, requestTenantId, `widget login (user=${payload?.username})`);
  }

  checkWidgetBootstrapTenantScope(accessToken: string, requestTenantId: string | null | undefined): void {
    const payload = this.decodeToken(accessToken);
    this.assertTenantScope(payload?.tenantId, requestTenantId, `widget bootstrap (user=${payload?.username})`);
  }
}
