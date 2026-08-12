import {
  Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VendorPortalApiKeyGuard } from './guards/vendor-portal-api-key.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { CheckProvisioningAvailabilityDto } from './dto/check-provisioning-availability.dto';
import { ConnectorDirectoryService } from '../connector/connector-directory.service';
import { ConnectorGateway } from '../connector/connector.gateway';
import { AuditService } from '../../audit/audit.service';
import { HisQueryDefinitionPublisherService } from '../../his/config/his-query-definition-publisher.service';
import type { User } from '../../users/entities/user.entity';

/**
 * Task #102 ("Vendor Portal Connector Management," 2026-07-22) -- every
 * audit-logged action below tags `metadata.actor` with either the
 * SUPER_ADMIN JWT user's id, or the literal string 'vendor-portal' when
 * `VendorPortalApiKeyGuard` authenticated the call via
 * `request.isVendorPortal` (no `User` exists for a service-to-service
 * call). `@CurrentUser()` returns `undefined` on that path, not a thrown
 * error -- see that decorator's implementation (`return request.user`, no
 * guard requires it to be set).
 */
function resolveActor(actor: User | undefined, req: { isVendorPortal?: boolean }): { userId?: string; label: string } {
  if (actor?.id) return { userId: actor.id, label: actor.id };
  return { label: req.isVendorPortal ? 'vendor-portal' : 'unknown' };
}

/**
 * TenantProvisioningController (Phase 10, Task 10.7; auth extended for
 * Cloud Tenant Onboarding -- see CLOUD_TENANT_ONBOARDING_DESIGN.md).
 *
 * Originally an INTERNAL platform-operator tool only (Vendor Portal
 * self-service onboarding was deferred per the user's Option 3 scope
 * decision -- see PHASE_10_DEFERRED_BACKLOG.md item 1). That deferred item
 * is now implemented: `VendorPortalApiKeyGuard` adds an additive
 * authentication path for Vendor Portal's own cloud-provisioning calls,
 * on top of (not instead of) the original SUPER_ADMIN JWT path -- see that
 * guard's doc comment for exactly how the two paths coexist. `@Roles`
 * still gates the JWT path the same way it always did; the API-key path
 * doesn't go through RolesGuard's role check at all (there is no user to
 * check a role against for a service-to-service call).
 */
@Controller('platform/tenant-provisioning')
@UseGuards(VendorPortalApiKeyGuard)
@Roles('SUPER_ADMIN')
export class TenantProvisioningController {
  constructor(
    private readonly provisioningService: TenantProvisioningService,
    private readonly connectorDirectory: ConnectorDirectoryService,
    private readonly connectorGateway: ConnectorGateway,
    private readonly auditService: AuditService,
    private readonly publisher: HisQueryDefinitionPublisherService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Tenant-Scoped User Identity, Task 9 -- pre-flight collision check.
   * Deliberately its own route ahead of `provision()`'s existing steps, not
   * folded into `provision()` itself, so a caller can check availability
   * repeatedly (e.g. as a form field blurs) without kicking off a real
   * provisioning run. See `TenantProvisioningService.checkAvailability()`'s
   * doc comment for the blocking-vs-advisory distinction per field.
   */
  @Post('check-availability')
  async checkAvailability(@Body() dto: CheckProvisioningAvailabilityDto) {
    return this.provisioningService.checkAvailability(dto);
  }

  /**
   * Task #102 -- deliberately declared ahead of `@Get(':runId')` below.
   * `:runId` matches any single path segment, and Nest/Express match
   * routes in registration order -- if this were declared after
   * `@Get(':runId')`, `GET /platform/tenant-provisioning/connector-installer`
   * would be swallowed by `get(runId: 'connector-installer')` instead,
   * which would 404/error trying to look up a nonexistent provisioning run.
   *
   * The Connector page's "Download Connector installer" action. See
   * `deployment.config.ts`'s doc comment on
   * `connectorInstallerVersion`/`connectorInstallerDownloadUrl` for why
   * this is config-driven rather than a database-backed releases table
   * today, and why `available: false` (not a broken/fabricated link) is
   * the honest response until Task #96 (Connector Installer) produces a
   * real build. Not tenant-scoped -- there is one current installer build
   * for every tenant, hence a controller-level route rather than nested
   * under `tenants/:tenantId`.
   */
  @Get('connector-installer')
  getConnectorInstaller() {
    const version = this.config.get<string>('deployment.connectorInstallerVersion', '');
    const downloadUrl = this.config.get<string>('deployment.connectorInstallerDownloadUrl', '');
    const releaseNotes = this.config.get<string>('deployment.connectorInstallerNotes', '');
    if (!version || !downloadUrl) {
      return { available: false as const };
    }
    return {
      available: true as const,
      version,
      downloadUrl,
      releaseNotes: releaseNotes || null,
    };
  }

  @Post()
  async provision(@Body() dto: ProvisionTenantDto) {
    const run = await this.provisioningService.provision(dto);
    const steps = await this.provisioningService.getRunSteps(run.id);
    // `summary` (Cloud Tenant Onboarding, CLOUD_TENANT_ONBOARDING_DESIGN.md
    // Section 6) is additive -- `run`/`steps` are unchanged for the
    // existing internal-operator use case, which may still want the full
    // audit trail. Vendor Portal's cloud-provisioning caller only needs
    // `summary`.
    const summary = await this.provisioningService.buildProvisioningSummary(run);
    return { run, steps, summary };
  }

  @Post(':runId/resume')
  async resume(
    @Param('runId') runId: string,
    @Body() body?: { adminUsername?: string; adminEmail?: string; adminFullName?: string; adminPassword?: string },
  ) {
    const run = await this.provisioningService.resume(runId, body);
    const steps = await this.provisioningService.getRunSteps(run.id);
    const summary = await this.provisioningService.buildProvisioningSummary(run);
    return { run, steps, summary };
  }

  @Get()
  async list() {
    return this.provisioningService.listRuns();
  }

  @Get(':runId')
  async get(@Param('runId') runId: string) {
    const run = await this.provisioningService.getRun(runId);
    const steps = await this.provisioningService.getRunSteps(runId);
    return { run, steps };
  }

  /**
   * Pilot rollback only (Task 10.8) -- see TenantProvisioningService
   * .deprovision()'s doc comment for exactly what this does and does not
   * do. Not a general tenant-management endpoint.
   */
  @Post('tenants/:tenantId/deprovision')
  async deprovision(@Param('tenantId') tenantId: string) {
    return this.provisioningService.deprovision(tenantId);
  }

  /**
   * Subdomain Release Lifecycle -- see TenantProvisioningService
   * .releaseSubdomain()'s doc comment. Deliberately a separate endpoint
   * from deprovision(), not a flag on it: releasing is a distinct,
   * explicit operator decision made (often much) later, not an automatic
   * side effect of deprovisioning.
   */
  @Post('tenants/:tenantId/release-subdomain')
  async releaseSubdomain(@Param('tenantId') tenantId: string) {
    return this.provisioningService.releaseSubdomain(tenantId);
  }

  /**
   * D.6 ("Onboarding UX," 2026-07-22) -- on-demand connector Activation
   * Code regeneration. See `TenantProvisioningService
   * .regenerateConnectorActivationCode()`'s doc comment: revokes any
   * currently-pending code for this tenant first, then issues and returns
   * a fresh one (shown exactly once here, same "shown once" convention as
   * every other bootstrap secret this controller/service handles).
   *
   * Task #102: this single endpoint serves BOTH "Generate Activation Code"
   * (a tenant with no pending code yet -- the revoke-stale-pending step is
   * simply a no-op, nothing to revoke) and "Regenerate Activation Code" (a
   * tenant that already has one). The Vendor Portal page shows whichever
   * label fits its current view of `GET tenants/:tenantId/connector`'s
   * state, but both buttons call this same route -- the backend operation
   * is genuinely identical either way, so a second endpoint would be a
   * distinction without a difference. Also now audit-logged (was a gap
   * before this task -- `CONNECTOR_ACTIVATION_CODE_REGENERATED` never
   * appeared in the audit trail at all).
   */
  @Post('tenants/:tenantId/connector-activation-code/regenerate')
  async regenerateConnectorActivationCode(
    @Param('tenantId') tenantId: string,
    @CurrentUser() actor: User | undefined,
    @Req() req: { isVendorPortal?: boolean },
  ) {
    const result = await this.provisioningService.regenerateConnectorActivationCode(tenantId);
    const { userId, label } = resolveActor(actor, req);
    // Never logs the raw `activationCode` itself -- same "never persist a
    // shown-once secret" posture this controller already applies to
    // temp passwords and pairing keys everywhere else.
    await this.auditService.log({
      action: 'CONNECTOR_ACTIVATION_CODE_REGENERATED',
      module: 'PLATFORM',
      userId,
      entityType: 'tenant',
      entityId: tenantId,
      newValue: { pairingId: result.pairingId, status: result.status, expiresAt: result.expiresAt },
      metadata: { triggeredBy: label, source: 'vendor-portal-connector-page' },
    });
    return result;
  }

  /**
   * D.6 ("Onboarding UX," 2026-07-22) -- the read side of the Vendor
   * Portal Connector page (§17-adjacent, connector onboarding roadmap).
   * `registered: false` (no `ConnectorInstance` row exists yet at all) is
   * distinct from `registered: true, isConnected: false` (paired at some
   * point, currently offline) -- the frontend needs both states to render
   * "Download & Activate" vs. "Reconnecting..." correctly. `version` is
   * honestly `null` today (see `ConnectorInstance`'s own doc comment --
   * nothing populates it yet, tracked under task "Connector hardening:
   * heartbeat + health"), not synthesized here.
   */
  @Get('tenants/:tenantId/connector')
  async getConnectorStatus(@Param('tenantId') tenantId: string) {
    const instance = await this.connectorDirectory.findInstanceForTenant(tenantId);
    if (!instance) {
      return { registered: false as const };
    }
    // Task #102 -- `definitions` is additive to the original Phase A/D.6
    // response: the Connector page's "health summary" needs to answer "are
    // this tenant's query definitions actually in sync," which the plain
    // ConnectorInstance row alone can't say. `getDefinitionsSummary()` is
    // read-only (see its own doc comment) -- this endpoint stays a pure
    // status read either way.
    const definitions = await this.publisher.getDefinitionsSummary(tenantId);
    return {
      registered: true as const,
      connectorId: instance.id,
      status: instance.status,
      hostname: instance.hostname,
      version: instance.version,
      lastSeenAt: instance.lastHeartbeatAt,
      isConnected: this.connectorGateway.isConnected(instance.id),
      registeredAt: instance.createdAt,
      definitions,
    };
  }

  /**
   * Task #102 ("Vendor Portal Connector Management") -- manual republish,
   * reachable from the Vendor Portal Connector page as well as (unchanged)
   * `LicenseController`'s existing internal-admin route
   * (`POST /license/his-query-definitions/:tenantId/republish`). Both
   * routes call the SAME `HisQueryDefinitionPublisherService.publishFull()`
   * -- no SQL/compile/publish logic is duplicated, only the thin
   * controller/guard layer, exactly like `TenantProvisioningController`
   * already duplicates `provision()`'s routing (not its logic) across the
   * SUPER_ADMIN-JWT and Vendor-Portal-API-key paths via
   * `VendorPortalApiKeyGuard`. A support engineer working entirely from
   * Vendor Portal should never need to be handed an internal ZoeConnect admin
   * JWT just to trigger a republish.
   */
  @Post('tenants/:tenantId/connector/republish')
  async republishConnectorDefinitions(
    @Param('tenantId') tenantId: string,
    @CurrentUser() actor: User | undefined,
    @Req() req: { isVendorPortal?: boolean },
  ) {
    const summary = await this.publisher.publishFull(tenantId);
    const { userId, label } = resolveActor(actor, req);
    await this.auditService.log({
      action: 'HIS_QUERY_DEFINITIONS_REPUBLISHED',
      module: 'PLATFORM',
      userId,
      entityType: 'tenant',
      entityId: tenantId,
      newValue: summary as unknown as Record<string, unknown>,
      metadata: { triggeredBy: label, source: 'vendor-portal-connector-page' },
    });
    return { ok: true, ...summary };
  }

  /**
   * Task #102 -- "Force Connector Resync." Same duplication rationale as
   * `republishConnectorDefinitions()` above: mirrors
   * `LicenseController`'s existing `POST /license/connector/:tenantId/resync`,
   * both delegate to `publishFull(tenantId, connectorId)` and neither
   * duplicates it. Looks the connector up itself (rather than requiring the
   * caller to already know its id) since the Vendor Portal page only has a
   * `tenantId` in scope.
   */
  @Post('tenants/:tenantId/connector/resync')
  async resyncConnector(
    @Param('tenantId') tenantId: string,
    @CurrentUser() actor: User | undefined,
    @Req() req: { isVendorPortal?: boolean },
  ) {
    const connectorId = await this.connectorDirectory.findConnectorIdForTenant(tenantId);
    if (!connectorId) {
      throw new NotFoundException(`Tenant "${tenantId}" has no registered Connector instance to resync`);
    }
    const summary = await this.publisher.publishFull(tenantId, connectorId);
    const { userId, label } = resolveActor(actor, req);
    await this.auditService.log({
      action: 'CONNECTOR_RESYNC_TRIGGERED',
      module: 'PLATFORM',
      userId,
      entityType: 'connector',
      entityId: connectorId,
      // `summary` (PublishSummary) already carries its own `tenantId`, set
      // from this same parameter -- writing it again here just duplicated
      // the identical value and tripped TS2783 ("this spread always
      // overwrites this property"). Caught by the first real `tsc` build
      // of this file (2026-07-22); `summary.tenantId` is relied on instead.
      newValue: { ...summary } as unknown as Record<string, unknown>,
      metadata: { triggeredBy: label, source: 'vendor-portal-connector-page' },
    });
    return { ok: true, connectorId, ...summary };
  }

  /**
   * Task #102 -- "View recent activity / audit history" panel. Filters to
   * the connector-lifecycle action set by default (see
   * `CONNECTOR_ACTIVITY_ACTIONS` below) rather than every audit action ever
   * logged against this tenant -- the Connector page is not meant to be a
   * general tenant audit-log viewer (ZoeConnect's own admin UI already has one),
   * just the actions relevant to connector operation.
   */
  @Get('tenants/:tenantId/connector/activity')
  async getConnectorActivity(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200) : 50;
    const entries = await this.auditService.findRecentForTenant(tenantId, {
      actions: CONNECTOR_ACTIVITY_ACTIONS,
      limit: parsedLimit,
    });
    return entries.map((e) => ({
      id: e.id,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      newValue: e.newValue,
      metadata: e.metadata,
      createdAt: e.createdAt,
    }));
  }

}

/**
 * Task #102 -- the connector-lifecycle audit actions surfaced on the
 * Vendor Portal Connector page's activity panel. Kept as one explicit list
 * (not "every action whose module is PLATFORM") so adding an unrelated
 * PLATFORM-module audit action elsewhere in the codebase later doesn't
 * silently start appearing here.
 */
const CONNECTOR_ACTIVITY_ACTIONS = [
  'HIS_QUERY_DEFINITIONS_REPUBLISHED',
  'CONNECTOR_RESYNC_TRIGGERED',
  'CONNECTOR_ACTIVATION_CODE_REGENERATED',
];
