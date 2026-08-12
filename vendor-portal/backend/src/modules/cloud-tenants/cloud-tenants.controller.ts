import {
  Body, Controller, Get, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { CloudTenantsService } from './cloud-tenants.service';
import { ProvisionCloudTenantDto } from './dto/provision-cloud-tenant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Cloud Tenant Onboarding, Phase B Step 6
// (CLOUD_TENANT_ONBOARDING_DESIGN.md, Section 3) -- the new, self-contained
// "Cloud Tenants" Vendor Portal feature ("Provision Cloud Tenant" screen).
// Every route here is authenticated Vendor Portal staff only (JwtAuthGuard,
// same guard `hospitals.controller.ts` uses for its own admin routes) --
// this is the *outbound caller* of ZoeConnect's provisioning API, not an endpoint
// ZoeConnect calls into. Deliberately kept out of HospitalsController/-Service/
// -Module entirely.
@Controller('cloud-tenants')
@UseGuards(JwtAuthGuard)
export class CloudTenantsController {
  constructor(private readonly svc: CloudTenantsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  /**
   * Task #102 -- deliberately declared ahead of `@Get(':id')` below.
   * `:id` matches any single path segment; Nest/Express match routes in
   * registration order, so if this were declared after `@Get(':id')`, a
   * request for `GET /cloud-tenants/connector-installer` would be
   * swallowed by `findOne(id: 'connector-installer')` instead (a 404 from
   * a bogus UUID lookup, not the installer info). Not tenant-scoped -- see
   * `CloudTenantsService.getConnectorInstaller()`'s doc comment.
   */
  @Get('connector-installer')
  getConnectorInstaller() {
    return this.svc.getConnectorInstaller();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  /**
   * Cloud Tenant Operations, Phase 10.1 -- provisioning-run step history
   * for the Tenant Details page. Kept as its own route rather than folded
   * into `findOne()` so the list/basic-detail path never pays the cost of
   * an outbound ZoeConnect call it doesn't need.
   */
  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.svc.getProvisioningHistory(id);
  }

  /** POST /api/cloud-tenants — provisions a new cloud tenant via ZoeConnect */
  @Post()
  provision(@Body() dto: ProvisionCloudTenantDto) {
    return this.svc.provision(dto);
  }

  /** Cloud Tenant Operations, Phase 10.2 -- see CloudTenantsService.deprovision() doc comment. */
  @Post(':id/deprovision')
  deprovision(@Param('id') id: string) {
    return this.svc.deprovision(id);
  }

  /** "Retry Provisioning" -- see CloudTenantsService.retry() doc comment. */
  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.svc.retry(id);
  }

  /**
   * Read-only pre-check the frontend calls before rendering the Retry
   * button's enabled state -- see CloudTenantsService.getRetryEligibility()
   * doc comment.
   */
  @Get(':id/retry-eligibility')
  getRetryEligibility(@Param('id') id: string) {
    return this.svc.getRetryEligibility(id);
  }

  /** Subdomain Release Lifecycle -- see CloudTenantsService.releaseSubdomain() doc comment. */
  @Post(':id/release-subdomain')
  releaseSubdomain(@Param('id') id: string) {
    return this.svc.releaseSubdomain(id);
  }

  // ── Connector Management (Task #102, "Vendor Portal Connector
  // Management," 2026-07-22) ────────────────────────────────────────────
  // Every route below is a thin proxy -- see the matching method's doc
  // comment on CloudTenantsService for what it forwards to on ZoeConnect.

  @Get(':id/connector')
  getConnectorStatus(@Param('id') id: string) {
    return this.svc.getConnectorStatus(id);
  }

  @Get(':id/connector/activity')
  getConnectorActivity(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.svc.getConnectorActivity(id, limit ? parseInt(limit, 10) : undefined);
  }

  @Post(':id/connector/republish')
  republishConnectorDefinitions(@Param('id') id: string) {
    return this.svc.republishConnectorDefinitions(id);
  }

  @Post(':id/connector/resync')
  resyncConnector(@Param('id') id: string) {
    return this.svc.resyncConnector(id);
  }

  @Post(':id/connector/activation-code/regenerate')
  regenerateConnectorActivationCode(@Param('id') id: string) {
    return this.svc.regenerateConnectorActivationCode(id);
  }
}
