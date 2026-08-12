import {
  Controller, Get, Post, Body, Param, UseGuards, UseInterceptors,
  Headers, RawBodyRequest, Req, HttpCode, Inject, Header,
  UnauthorizedException, BadRequestException, NotFoundException, Logger,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiResponse,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import type { FastifyRequest } from 'fastify';
import { LicenseService }    from './license.service';
import { ILicenseProvider } from '../platform/infrastructure/licensing/license-provider.interface';
import { LICENSE_PROVIDER } from '../platform/infrastructure/tokens';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { VendorSyncService } from './vendor-sync.service';
import { HisConfigService }  from '../his/config/his-config.service';
import { HisQueryDefinitionPublisherService } from '../his/config/his-query-definition-publisher.service';
import { OraclePoolManager } from '../his/oracle-pool.service';
import { SettingsService }   from '../settings/settings.service';
import { AuditService }      from '../audit/audit.service';
import { ConnectorDirectoryService } from '../platform/connector/connector-directory.service';
import { UploadLicenseDto } from './dto/upload-license.dto';
import { RegisterHospitalDto } from './dto/register-hospital.dto';
import { SubmitLicenseRequestDto } from './dto/license-request.dto';
import { VendorWebhookDto } from './dto/vendor-webhook.dto';
import { InternalProvisionDto } from './dto/internal-provision.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import type { User } from '../users/entities/user.entity';

@ApiTags('License')
@Controller('license')
export class LicenseController {
  private readonly logger = new Logger(LicenseController.name);

  constructor(
    private readonly licenseService: LicenseService,
    private readonly vendorSyncService: VendorSyncService,
    private readonly hisConfigService: HisConfigService,
    private readonly hisQueryDefinitionPublisher: HisQueryDefinitionPublisherService,
    private readonly oraclePoolService: OraclePoolManager,
    private readonly settingsService: SettingsService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
    private readonly connectorDirectory: ConnectorDirectoryService,
    private readonly jwtService: JwtService,
    @Inject(LICENSE_PROVIDER) private readonly licenseProvider: ILicenseProvider,
  ) {}

  /**
   * ZoeConnect Identity Architecture Migration -- best-effort, non-throwing
   * tenant resolution for `getStatus()` below. This route is `@Public()`
   * (the pre-login page reads it with no session at all), so it can never
   * require a token -- but when the dashboard calls it WITH a session, the
   * response should reflect that session's real tenant, not always fall
   * back to the seeded 'default' tenant. Any failure (no header, malformed,
   * expired, bad signature) resolves to `undefined`, which callers already
   * treat as "use the ambient/ 'default' fallback" -- exactly today's
   * pre-login behavior, unchanged.
   *
   * Deliberately manual `jwtService.verify()` rather than routing through
   * `JwtAuthGuard`/`JwtStrategy`: the latter also runs a DB user lookup +
   * Redis blacklist check on every hit, which is unnecessary work (and an
   * unnecessary DB/Redis dependency) for a public status page that may be
   * hit anonymously far more often than authenticated.
   */
  private extractTenantIdFromOptionalBearer(req: FastifyRequest): string | undefined {
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return undefined;
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return payload.tenantId ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Timing-safe comparison for the `X-Provisioning-Secret` header, mirroring
   * `VendorPortalApiKeyGuard.isValidKey()` (tenant-provisioning/guards/
   * vendor-portal-api-key.guard.ts) — same length pre-check (timingSafeEqual
   * throws on mismatched buffer lengths rather than returning false) and the
   * same "empty configured secret never matches" rule, so an unset
   * PROVISIONING_SECRET can't accidentally be satisfied by an empty header.
   * Previously a plain `!==` string comparison, which is not constant-time.
   */
  private isValidProvisioningSecret(provided: string | undefined): boolean {
    const configured = this.config.get<string>('deployment.provisioningSecret', '');
    if (!provided || !configured) return false;
    const providedBuf = Buffer.from(provided);
    const configuredBuf = Buffer.from(configured);
    if (providedBuf.length !== configuredBuf.length) return false;
    return crypto.timingSafeEqual(providedBuf, configuredBuf);
  }

  // ── GET /api/v1/license/status (public — login page AND the dashboard both read it) ──
  // ZoeConnect Identity Architecture Migration -- real incident (2026-07-30):
  // a freshly provisioned cloud tenant's dashboard showed a stale trial
  // countdown ("28 days remaining" moments after a 30-day trial was issued)
  // and no hospital name. Root cause: this route stayed `@Public()` and
  // called `licenseService.getStatus()` with NO tenant argument at all, so
  // it always resolved (via LicenseService's own ambient-fallback chain,
  // see resolveLicenseCacheTenantKey()) to the seeded 'default' tenant's
  // single, shared trial record -- the one LicenseService.activateTrial()
  // creates once at first backend boot (hardcoded `hospitalName: 'Trial
  // Installation'`), counting down from ITS OWN activation date. That record
  // has nothing to do with any cloud tenant's own `SubscriptionLicense` row
  // (created per-tenant by TenantProvisioningService.stepIssueTrialLicense()
  // and already read correctly, tenant-scoped, by LicenseGuard for actual
  // module-access enforcement via `this.licenseProvider.getStatus(tenantId)`
  // -- see license.guard.ts). This endpoint just never used that same,
  // already-correct provider/tenantId lookup for its own status DISPLAY.
  //
  // Fix: stays `@Public()` (the pre-login page reads this with no session
  // at all, and must keep working), but now optionally resolves the caller's
  // real tenant from a Bearer token if one is present (see
  // extractTenantIdFromOptionalBearer() above), and calls the SAME
  // `licenseProvider.getStatus(tenantId)` LicenseGuard already trusts for
  // enforcement -- so the banner the user sees now always matches what's
  // actually being enforced. No change for the no-session pre-login case:
  // an absent/invalid token still resolves to `undefined`, exactly the
  // no-argument call this replaces.
  //
  // `deploymentMode`/`vendorRegistrationRequired` are NOT part of
  // `ILicenseProvider.getStatus()`'s response shape -- they're
  // `LicenseService`-only fields the login page's own deployment-mode
  // detection depends on (see app.config.ts's doc comment: "the frontend
  // now reads deployment mode live from the backend's GET /license/status").
  // Attached here from `LicenseService`'s own (now-public) helpers rather
  // than dropped, so this stays a single, complete response for every
  // existing consumer of this route.
  // Bug fix (2026-07-31, real incident -- TEST4 admin's dashboard showed
  // "TEST6" as the hospital name/tenant, even on a brand-new session after
  // a full logout+login): the DB confirmed everything server-side was
  // correct (TEST4's user row's tenant_id, TEST4's own subscription_licenses
  // row with hospital_name='TEST4', and SubscriptionLicenseProvider.getStatus()
  // correctly scoping by tenantId with no cross-tenant query path at all).
  // This route never set any Cache-Control header, and the frontend calls
  // it via a plain GET with no cache-busting param -- browsers key their
  // HTTP cache by method+URL only, NOT by request headers, unless the
  // server sends `Vary`. So a GET to this exact URL made while logged in as
  // TEST6 got cached by the browser, and TEST4's subsequent identical GET
  // (different Authorization header, same URL) was served that stale
  // cached body straight from disk/memory cache -- the request never even
  // reached this handler, which is why the JWT/tenant resolution above was
  // never actually wrong. `no-store` forbids the browser from caching this
  // response at all, which is correct: it's authenticated, tenant-specific
  // data masquerading as a cacheable public GET.
  @Header('Cache-Control', 'no-store')
  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Get current license status and licensed modules' })
  async getStatus(@Req() req: FastifyRequest) {
    const tenantId = this.extractTenantIdFromOptionalBearer(req);
    const status = await this.licenseProvider.getStatus(tenantId);
    return {
      ...status,
      deploymentMode: this.licenseService.getDeploymentMode(),
      vendorRegistrationRequired: this.licenseService.isVendorRegistrationRequired(),
      // Runtime source of truth for AuthProvider.tsx's post-logout
      // marketing-site hand-off -- see LicenseService.getPublicLoginUrl()'s
      // doc comment for the incident this replaces (a stale
      // NEXT_PUBLIC_MARKETING_SITE_URL build-time constant).
      publicLoginUrl: this.licenseService.getPublicLoginUrl(),
    };
  }

  // ── GET /api/v1/license/fingerprint ──────────────────────────────────────────
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('PLATFORM:SETTINGS:READ')
  @Get('fingerprint')
  @ApiOperation({ summary: 'Get machine fingerprint for vendor license issuance' })
  getFingerprint() {
    return { fingerprint: this.licenseService.getMachineFingerprint() };
  }

  // ── POST /api/v1/license/upload (legacy — still supported) ───────────────────
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('PLATFORM:SETTINGS:UPDATE')
  @Audit({ action: 'UPLOAD_LICENSE', module: 'PLATFORM' })
  @Post('upload')
  @ApiOperation({ summary: 'Manually upload and activate a license file' })
  uploadLicense(@Body() dto: UploadLicenseDto, @CurrentUser() actor: User) {
    return this.licenseService.uploadLicense(dto.license, actor.id);
  }

  // ── GET /api/v1/license/registration ─────────────────────────────────────────
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('PLATFORM:SETTINGS:READ')
  @Get('registration')
  @ApiOperation({ summary: 'Get vendor registration status for this ZoeConnect instance' })
  async getRegistration() {
    // Licensing Module Tenant-Scoping Migration, Phase 3 of 6 -- this route
    // runs under a real JWT session (JwtAuthGuard + PermissionsGuard just
    // above), so the tenant-scoped lookup is used rather than the raw,
    // global getRegistration() (which stays reserved for machine-token
    // paths that have no session to scope by).
    const reg = await this.vendorSyncService.getRegistrationForCurrentTenant();
    if (!reg) return { registered: false };
    return {
      registered:   true,
      status:        reg.status,
      hospitalName:  reg.hospitalName,
      hospitalCode:  reg.hospitalCode,
      vendorApiUrl:  reg.vendorApiUrl,
      publicIp:      reg.publicIp,
      publicPort:    reg.publicPort,
      registeredAt:  reg.registeredAt,
    };
  }

  // ── POST /api/v1/license/register ────────────────────────────────────────────
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('PLATFORM:SETTINGS:UPDATE')
  @Audit({ action: 'VENDOR_REGISTER', module: 'PLATFORM' })
  @Post('register')
  @ApiOperation({ summary: 'Register this ZoeConnect instance with the vendor platform' })
  async register(@Body() dto: RegisterHospitalDto) {
    const reg = await this.vendorSyncService.register(dto);
    return {
      registered:   true,
      status:        reg.status,
      instanceToken: reg.instanceToken,
      registeredAt:  reg.registeredAt,
    };
  }

  // ── POST /api/v1/license/his-query-definitions/:tenantId/republish ──────────
  // D.6 ("Dynamic Per-Tenant HIS Query Architecture," production publication
  // lifecycle, 2026-07-22): the permanent, authenticated replacement for
  // "no such endpoint is built in this pass" (D.3's original scope note).
  // Recompiles every registered queryId for `tenantId` and pushes the full
  // current set to that tenant's connected Connector (if any) -- exactly
  // `HisQueryDefinitionPublisherService.publishFull()`, called directly
  // (not via the Bull queue) for immediate, synchronous HTTP feedback to
  // the admin who triggered it. Legitimate to call whether or not the
  // config actually changed -- e.g. after a suspected drift, or simply to
  // confirm the current definitions match what's configured.
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('PLATFORM:SETTINGS:UPDATE')
  @Post('his-query-definitions/:tenantId/republish')
  @ApiOperation({ summary: 'Manually recompile and republish every HIS query definition for a tenant' })
  async republishHisQueryDefinitions(
    @Param('tenantId') tenantId: string,
    @CurrentUser() actor: User,
  ) {
    const summary = await this.hisQueryDefinitionPublisher.publishFull(tenantId);

    await this.auditService.log({
      action: 'HIS_QUERY_DEFINITIONS_REPUBLISHED',
      module: 'PLATFORM',
      userId: actor.id,
      entityType: 'tenant',
      entityId: tenantId,
      newValue: summary as unknown as Record<string, unknown>,
    });

    this.logger.log(
      `HIS query definitions republished by user=${actor.id} tenant=${tenantId}: ` +
      `changed=[${summary.changedQueryIds.join(', ')}] skipped=[${summary.skippedQueryIds.join(', ')}] pushed=${summary.pushed}`,
    );

    return { ok: true, ...summary };
  }

  // ── POST /api/v1/license/connector/:tenantId/resync ──────────────────────────
  // D.6: distinct entry point (own audit action, own operator-facing intent
  // -- "this tenant's Connector looks stale/disconnected, force a resync")
  // from `republish` above, though both currently share the same underlying
  // mechanism (`publishFull()` recompiles AND re-pushes the full current
  // set) -- there is no separate Connector-side "clear registry" primitive
  // today (see DYNAMIC_HIS_QUERY_ARCHITECTURE.md §16); a stale/removed
  // queryId is not purged from the Connector's in-memory registry by this
  // call, only every currently-valid queryId is guaranteed freshly pushed.
  // Fails loudly with 404 if the tenant has never registered a Connector at
  // all (a real setup problem), distinct from "registered but currently
  // offline" (a 200 with `pushed: false` -- recoverable automatically once
  // that Connector reconnects, since reconnection itself triggers its own
  // full republish).
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('PLATFORM:SETTINGS:UPDATE')
  @Post('connector/:tenantId/resync')
  @ApiOperation({ summary: 'Force a full HIS query definition resync to a tenant\'s registered Connector' })
  async resyncConnector(
    @Param('tenantId') tenantId: string,
    @CurrentUser() actor: User,
  ) {
    const connectorId = await this.connectorDirectory.findConnectorIdForTenant(tenantId);
    if (!connectorId) {
      throw new NotFoundException(`Tenant "${tenantId}" has no registered Connector instance to resync`);
    }

    const summary = await this.hisQueryDefinitionPublisher.publishFull(tenantId, connectorId);

    await this.auditService.log({
      action: 'CONNECTOR_RESYNC_TRIGGERED',
      module: 'PLATFORM',
      userId: actor.id,
      entityType: 'connector',
      entityId: connectorId,
      // `summary` (PublishSummary) already carries its own `tenantId`, set
      // from this same parameter -- writing it again here just duplicated
      // the identical value and tripped TS2783 ("this spread always
      // overwrites this property"). Caught by the first real `tsc` build
      // of this file (2026-07-22); `summary.tenantId` is relied on instead.
      newValue: { ...summary } as unknown as Record<string, unknown>,
    });

    this.logger.log(
      `Connector resync triggered by user=${actor.id} tenant=${tenantId} connector=${connectorId}: ` +
      `pushed=${summary.pushed} changed=[${summary.changedQueryIds.join(', ')}]`,
    );

    return { ok: true, connectorId, ...summary };
  }

  // ── POST /api/v1/license/internal-provision ────────────────────────────────
  // NOTE (production-hardening pass): this endpoint's status as an intended,
  // canonical part of the cloud-provisioning architecture is UNRESOLVED —
  // it is absent from CLOUD_TENANT_ONBOARDING_DESIGN.md, absent from the
  // last committed HEAD at the time of this pass, and calls a code path
  // (VendorSyncService.internalProvision / VendorRegistration) that is
  // architecturally singleton/non-tenant-scoped, unlike the sanctioned
  // TenantProvisioningController flow. This pass only hardens what's here
  // (validation, timing-safe secret check, audit logging) — it does not
  // remove, replace, or endorse this endpoint. See conversation history /
  // PR description for the full evidence trail; resolving which mechanism
  // is canonical is left for review.
  @Public()
  @Post('internal-provision')
  @Audit({ action: 'INTERNAL_PROVISION', module: 'PLATFORM' })
  @ApiOperation({ summary: 'Internal endpoint for auto-registering a cloud tenant' })
  async internalProvision(
    @Headers('x-provisioning-secret') secret: string,
    @Body() body: InternalProvisionDto,
  ) {
    if (!this.isValidProvisioningSecret(secret)) {
      this.logger.warn('internal-provision: rejected request with invalid or missing provisioning secret');
      throw new UnauthorizedException('Invalid provisioning secret');
    }
    const reg = await this.vendorSyncService.internalProvision(body);
    return { ok: true, message: 'Tenant successfully provisioned', status: reg.status };
  }

  // ── GET /api/v1/license/history ──────────────────────────────────────────────
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('PLATFORM:SETTINGS:READ')
  @Get('history')
  @ApiOperation({ summary: 'Full license event history — all license_master records' })
  getLicenseHistory() {
    return this.licenseService.getHistory();
  }

  // ── GET /api/v1/license/requests ─────────────────────────────────────────────
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('PLATFORM:SETTINGS:READ')
  @Get('requests')
  @ApiOperation({ summary: 'List all license requests sent to vendor' })
  listRequests() {
    return this.vendorSyncService.listRequests();
  }

  // ── POST /api/v1/license/request ─────────────────────────────────────────────
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('PLATFORM:SETTINGS:UPDATE')
  @Audit({ action: 'SUBMIT_LICENSE_REQUEST', module: 'PLATFORM' })
  @Post('request')
  @ApiOperation({ summary: 'Submit a license module request to the vendor' })
  submitRequest(@Body() dto: SubmitLicenseRequestDto) {
    return this.vendorSyncService.submitRequest(dto);
  }

  // ── POST /api/v1/license/requests/:id/cancel ─────────────────────────────────
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('PLATFORM:SETTINGS:UPDATE')
  @Audit({ action: 'CANCEL_LICENSE_REQUEST', module: 'PLATFORM' })
  @Post('requests/:id/cancel')
  @ApiOperation({ summary: 'Withdraw a still-pending license request before the vendor acts on it' })
  cancelRequest(@Param('id') id: string) {
    return this.vendorSyncService.cancelRequest(id);
  }

  // ── POST /api/v1/license/oracle-test ─────────────────────────────────────────
  // Called by the vendor portal's "Test Connection" button.
  // Authenticated via X-Instance-Token header (same as his-config-export).
  // Creates a throwaway Oracle pool with the supplied credentials, verifies
  // connectivity, then destroys it. Does NOT affect the live pool.
  //
  // Licensing Module Tenant-Scoping Migration, Phase 4 of 6 -- UPDATE
  // (2026-07-21, CLOUD_VS_SELF_HOSTED_ROADMAP.md Phase 3): OraclePoolManager
  // (renamed from OraclePoolService) is now genuinely tenant-aware, so the
  // limitation this comment used to describe no longer applies IN
  // PRINCIPLE -- but this specific route is still effectively self-hosted-
  // only in practice: it's `@Public()` with no `TenantContextInterceptor`
  // (auth is the X-Instance-Token header, not a JWT), so there's no
  // ambient tenant here and `reconfigure()` falls back to the default
  // pool. That's fine today because vendor-portal's `testDbConnection()`
  // (the only caller) is itself still gated to self-hosted hospitals only
  // (`assertSelfHosted()`, vendor-portal/backend/hospitals.service.ts) --
  // deliberately deferred, see that guard's doc comment. When that gate is
  // lifted for cloud post-launch, this route will need the requesting
  // tenant threaded through explicitly (same `req.tenantId`-from-subdomain
  // pattern used for Token Queue's public routes earlier this session),
  // since there's no JWT here to carry it.
  @Public()
  @Post('oracle-test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Test Oracle DB connection — vendor portal probe endpoint' })
  async testOracleConnection(
    @Headers('x-instance-token') token: string,
    @Body() body: { dbCredentials: Record<string, string> },
  ) {
    if (!token) throw new UnauthorizedException('Missing X-Instance-Token header');
    const valid = await this.vendorSyncService.validateInstanceToken(token);
    if (!valid) throw new UnauthorizedException('Invalid or unrecognised instance token');

    if (!body?.dbCredentials || !Object.keys(body.dbCredentials).length) {
      throw new BadRequestException('dbCredentials object is required');
    }

    return this.oraclePoolService.reconfigure(body.dbCredentials, /* testOnly */ true);
  }

  // ── GET /api/v1/license/his-config-export ────────────────────────────────────
  // Called by the vendor portal to pull the currently-running HIS SQL queries
  // from a live ZoeConnect instance. Authenticated via X-Instance-Token header.
  //
  // Licensing Module Tenant-Scoping Migration, Phase 4 of 6 -- same KNOWN,
  // DOCUMENTED LIMITATION as oracle-test above: the instance-token lookup
  // itself is tenant-safe (natural, globally-unique key), but
  // HisConfigService.getConfig() reads from a single global Redis cache
  // key, with no tenant parameter anywhere in its read path -- out of
  // scope for this migration (HIS module, not Licensing). Flagging here
  // rather than silently leaving it undocumented.
  @Public()
  @Get('his-config-export')
  @ApiOperation({ summary: 'Export live HIS schema config — vendor portal sync endpoint' })
  async hisConfigExport(@Headers('x-instance-token') token: string) {
    if (!token) throw new UnauthorizedException('Missing X-Instance-Token header');
    const valid = await this.vendorSyncService.validateInstanceToken(token);
    if (!valid) throw new UnauthorizedException('Invalid or unrecognised instance token');
    return this.hisConfigService.getConfig();
  }

  // ── POST /api/v1/license/vendor-webhook ──────────────────────────────────────
  // Called by the vendor platform to push license approvals, revocations, etc.
  // Authentication: HMAC-SHA256 in X-Vendor-Signature header
  @Public()
  @Post('vendor-webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vendor webhook endpoint — receives license events from vendor platform' })
  async vendorWebhook(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('x-vendor-signature') signatureHeader: string,
    @Body() dto: VendorWebhookDto,
  ) {
    if (!signatureHeader) {
      throw new UnauthorizedException('Missing X-Vendor-Signature header');
    }

    // Verify HMAC using raw body
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available — ensure rawBody is enabled in Fastify');
    }

    // Licensing Module Tenant-Scoping Migration, Phase 4 of 6 -- resolves
    // the matched VendorRegistration (not just a boolean) so its tenantId
    // can be established as ambient context for the rest of this handler,
    // below. This route is @Public() (no JWT, no TenantContextInterceptor),
    // so without this, markRequestResolved()/markAllRequestsRevoked()'s
    // now-scoped repository calls would throw "no tenant context
    // established" the moment they run.
    const reg = await this.vendorSyncService.resolveVerifiedWebhookRegistration(rawBody, signatureHeader);
    if (!reg) {
      this.logger.warn('Vendor webhook received with invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // reg.tenantId is null only for a VendorRegistration created via the
    // still-unresolved internal-provision path (left untouched, does not
    // stamp tenantId -- see that endpoint's own doc comment) or, in
    // principle, a pre-backfill row on a database that skipped migrations
    // out of order. runAsSystem() makes every scoped-repo call below
    // behave exactly as it did before this migration (unfiltered) for that
    // one edge case, rather than guessing at a tenant or throwing.
    return reg.tenantId
      ? TenantContextStorage.run(reg.tenantId, () => this.handleVerifiedWebhookEvent(dto))
      : TenantContextStorage.runAsSystem(() => this.handleVerifiedWebhookEvent(dto));
  }

  private async handleVerifiedWebhookEvent(dto: VendorWebhookDto) {
    this.logger.log(`Vendor webhook received: type=${dto.type}`);

    // ── HIS_CONFIG_UPDATE — store Oracle schema mappings and return early ────
    // This event carries no license payload; it is purely a config push.
    if (dto.type === 'HIS_CONFIG_UPDATE') {
      const configCount = dto.hisConfig      ? Object.keys(dto.hisConfig).length      : 0;
      const credCount   = dto.dbCredentials  ? Object.keys(dto.dbCredentials).length  : 0;
      const userCount   = dto.hdspUsers?.length ?? 0;

      if (configCount) {
        // Tenant-Scoped User Identity, Task 8 (dto.tenantId) + Task 10
        // (applyWebhookUpdate() now tenant-aware) -- see applyHdspUsers()'s
        // comment just below for the optional/fallback shape; identical here.
        const resolvedTenantId = await this.hisConfigService.applyWebhookUpdate(dto.hisConfig!, dto.tenantId);

        // D.3 ("Dynamic Per-Tenant HIS Query Architecture" Publisher,
        // 2026-07-21): the "HisSchemaConfig saved" trigger from
        // DYNAMIC_HIS_QUERY_ARCHITECTURE.md §7's lifecycle table.
        // `resolvedTenantId` is whichever tenant applyWebhookUpdate() ACTUALLY
        // wrote to (its own default-tenant fallback resolution, not
        // re-derived here) -- null only if that call itself failed/no-opped,
        // in which case there's nothing new to publish. Failure here is
        // logged, not rethrown: a template-publish failure must never turn
        // into a failed HIS_CONFIG_UPDATE webhook response (the config write
        // itself already succeeded).
        if (resolvedTenantId) {
          // D.6 ("production publication lifecycle," 2026-07-22): enqueued
          // (Bull retry/backoff) rather than called directly -- this is an
          // unattended webhook handler with nothing watching for failure,
          // so a transient DB/Redis blip should be retried automatically
          // instead of silently losing this publish opportunity until the
          // next HIS_CONFIG_UPDATE. See HisQueryDefinitionPublisherService's
          // doc comment for the full rationale.
          this.hisQueryDefinitionPublisher.enqueuePublishChanged(resolvedTenantId).catch((err) =>
            this.logger.error(`Failed to enqueue HIS query template publish for tenant=${resolvedTenantId}: ${(err as Error).message}`),
          );
        }
      }
      if (userCount) {
        // Tenant-Scoped User Identity, Task 8 -- `dto.tenantId` is optional;
        // self-hosted callers (the only confirmed-live sender today) omit
        // it and applyHdspUsers() falls back to the seeded 'default'
        // tenant, unchanged from pre-Task-8 behavior. A future cloud
        // HIS-sync sender would pass CloudTenant.hdspTenantId here.
        await this.hisConfigService.applyHdspUsers(dto.hdspUsers!, dto.tenantId);
      }

      // ── DB credential reconfiguration ──────────────────────────────────────
      // When dbCredentials are present, also save them to the config store so
      // they survive a restart (OraclePoolManager reads oracle.* from .env
      // for the default/self-hosted pool on boot, and reads a real tenant's
      // db.* rows on first use for that tenant's pool -- either way, we
      // override at runtime with the pushed creds here). reconfigure()
      // below runs inside this handler's TenantContextStorage.run(reg.
      // tenantId, ...) wrapper (see vendorWebhook() above), so it correctly
      // targets that tenant's own pool, not always the default one.
      if (credCount) {
        await this.hisConfigService.applyWebhookUpdate(dto.dbCredentials!, dto.tenantId);
        const reconfigResult = await this.oraclePoolService.reconfigure(dto.dbCredentials!);
        if (!reconfigResult.ok) {
          this.logger.warn(`Oracle pool reconfigure failed: ${reconfigResult.message}`);
        } else {
          this.logger.log(`Oracle pool reconfigured via vendor push: ${reconfigResult.message}`);
        }
      }

      if (!configCount && !credCount && !userCount) {
        this.logger.warn('HIS_CONFIG_UPDATE received with empty payload');
      }
      return {
        ok: true,
        message: `HIS config updated (${configCount} schema keys, ${credCount} DB credential keys, ${userCount} users)`,
      };
    }

    // For SYSTEM_SETTINGS_UPDATE — apply the settings and return early
    if (dto.type === 'SYSTEM_SETTINGS_UPDATE') {
      const settingsCount = dto.systemSettings ? Object.keys(dto.systemSettings).length : 0;
      if (settingsCount > 0) {
        await this.settingsService.applyWebhookUpdate(dto.systemSettings!);
      }
      return {
        ok: true,
        message: `System settings updated (${settingsCount} keys)`,
      };
    }

    // For REQUEST_REJECTED — update local request record first
    if (dto.type === 'REQUEST_REJECTED' && dto.vendorRequestId) {
      await this.vendorSyncService.markRequestResolved(dto.vendorRequestId, 'REJECTED', dto.reason);
    }

    // For LICENSE_APPROVED — update local request record
    if (dto.type === 'LICENSE_APPROVED' && dto.vendorRequestId) {
      await this.vendorSyncService.markRequestResolved(dto.vendorRequestId, 'APPROVED');
    }

    // For LICENSE_REVOKED — mark all approved requests as revoked
    if (dto.type === 'LICENSE_REVOKED') {
      await this.vendorSyncService.markAllRequestsRevoked();
    }

    // Delegate core license state changes to LicenseService
    const result = await this.licenseService.processWebhookEvent({
      type:            dto.type,
      signedLicense:   dto.signedLicense,
      reason:          dto.reason,
      forceLogout:     dto.forceLogout,
      reset:           dto.reset,
      modules:         dto.modules,
      newExpiresAt:    dto.newExpiresAt,
      vendorRequestId: dto.vendorRequestId,
    });

    return result;
  }
}
