import { registerAs } from '@nestjs/config';

/**
 * Deployment mode scaffolding (Phase 0 — Hybrid Architecture roadmap).
 *
 * DEPLOYMENT_MODE is reserved for future Hybrid Architecture behavior
 * (cloud vs. self-hosted provider selection, tenancy activation, etc.).
 * Introduced here as infrastructure only — nothing reads this value yet,
 * and it must not affect runtime behavior until a later roadmap phase
 * explicitly wires it in. Do not branch on `deployment.mode` prematurely.
 */
export const deploymentConfig = registerAs('deployment', () => ({
  mode: (process.env.DEPLOYMENT_MODE as 'self_hosted' | 'cloud') || 'self_hosted',
  // Cloud Tenant Onboarding (see CLOUD_TENANT_ONBOARDING_DESIGN.md,
  // VendorPortalApiKeyGuard) — shared secret Vendor Portal presents to
  // call TenantProvisioningController before any ZoeConnect tenant/user exists
  // to authenticate as normally. Empty string in self-hosted (env.validation.ts
  // only requires it when DEPLOYMENT_MODE=cloud), which VendorPortalApiKeyGuard
  // treats as "this path is disabled" -- see that guard's doc comment.
  vendorPortalApiKey: process.env.VENDOR_PORTAL_API_KEY || '',
  // Shared secret gating LicenseController.internalProvision() (the
  // pre-existing "X-Provisioning-Secret" path — see that method's doc
  // comment). Routed through ConfigService here purely so the controller
  // reads it the same way every other secret in this file is read, instead
  // of a direct `process.env` read; NOT a statement about whether this
  // endpoint is the intended cloud-provisioning mechanism (see the
  // doc comment on `internalProvision()` — that question is unresolved
  // and deliberately left for architectural review, not decided by this
  // config plumbing change). env.validation.ts's requiredness for this
  // var is unchanged.
  provisioningSecret: process.env.PROVISIONING_SECRET || '',
  // Vendor Portal Connector Management (Task #102, "Onboarding UX,"
  // 2026-07-22) -- the Connector installer artifact itself (Task #96) is
  // not built yet, but the Vendor Portal Connector page's "Download"
  // action and API contract are finalized now per the task's explicit
  // scope. These three are deliberately just config, not a database-backed
  // "releases" table: there is exactly one current installer build at any
  // given time (no fleet of historical versions to browse yet -- that's
  // fleet-management/auto-update territory, Task #94/#97), so a config
  // value an operator updates on each new build is the honest amount of
  // machinery for what exists today. All optional/empty until Task #96
  // actually produces a build to point these at; `GET
  // /platform/tenant-provisioning/connector-installer` reports
  // `available: false` when `connectorInstallerDownloadUrl` is unset,
  // rather than fabricating a broken link.
  connectorInstallerVersion: process.env.CONNECTOR_INSTALLER_VERSION || '',
  connectorInstallerDownloadUrl: process.env.CONNECTOR_INSTALLER_DOWNLOAD_URL || '',
  connectorInstallerNotes: process.env.CONNECTOR_INSTALLER_NOTES || '',
  // Allow Cloud Tenants to Submit License Requests -- base URL of the
  // Vendor Portal's own API. VendorSyncService.submitRequest() uses this to
  // actually reach the Vendor Portal when a registration's `vendorApiUrl`
  // is the internal 'internal://vendor-portal' placeholder (set by
  // autoRegisterCloudTenant() -- there is no real externally-registered
  // vendor URL for a cloud tenant to call, since the Vendor Portal itself
  // provisioned it) rather than mocking a fake `vendorRequestId` locally.
  // Empty string in self-hosted (never read there -- self-hosted's own
  // register() always stores a real vendorApiUrl and never takes this
  // internal-placeholder code path at all).
  vendorPortalUrl: process.env.VENDOR_PORTAL_URL || '',
}));
