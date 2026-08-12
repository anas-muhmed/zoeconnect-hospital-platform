import { apiClient } from './client';

// Cloud Tenant Onboarding, Phase B Step 6 (CLOUD_TENANT_ONBOARDING_DESIGN.md,
// Section 3). Kept as its own file, separate from vendor.api.ts's
// hospital-focused functions/types, mirroring the backend-side separation
// (CloudTenantsModule never imports HospitalsModule and vice versa).

// 'RETRYING' -- see CloudTenant.provisioningStatus's doc comment on the
// backend entity: an extremely short-lived transitional status (normally
// only observable for milliseconds) used as an atomic concurrency guard
// so two racing Retry requests can't both resume the same saga at once.
export type CloudTenantProvisioningStatus = 'PENDING' | 'PROVISIONING' | 'ACTIVE' | 'FAILED' | 'DEPROVISIONED' | 'RETRYING';

export interface ProvisioningStep {
  stepNumber: number;
  stepName: string;
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed';
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProvisioningHistory {
  run: { id: string; status: string; error?: string | null; createdAt: string; updatedAt?: string };
  steps: ProvisioningStep[];
}

export interface CloudTenant {
  id: string;
  hospitalName: string;
  // ZoeConnect Identity Architecture Migration, Phase 6: subdomains are no
  // longer part of the platform's identity/login architecture -- may be
  // null (the common case going forward). Preserved for historical display
  // only; never used to build a login URL (see `loginUrl` below, which now
  // always comes from ZoeConnect's shared https://zoeconnect.in/login constant).
  subdomain: string | null;
  hdspTenantId: string | null;
  adminUsername: string;
  adminEmail: string;
  loginUrl: string | null;
  provisioningStatus: CloudTenantProvisioningStatus;
  provisionedAt: string | null;
  provisioningRunId: string | null;
  subscriptionPlan: string | null;
  failureReason: string | null;
  // Subdomain Release Lifecycle -- null means this row still claims its
  // subdomain (including the entire deprovisioned-but-unreleased period);
  // non-null means an operator explicitly released it, freeing that
  // subdomain string up for a different tenant to claim.
  subdomainReleasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProvisionCloudTenantDto {
  hospitalName: string;
  // Optional as of Phase 6 -- subdomains are no longer required or used for
  // organization identity/login. Kept only for legacy callers/integrations.
  subdomain?: string;
  adminUsername: string;
  adminEmail: string;
  adminFullName?: string;
  subscriptionPlan?: string;
}

export const cloudTenantsApi = {
  list: () =>
    apiClient.get<CloudTenant[]>('/cloud-tenants').then(r => r.data),

  get: (id: string) =>
    apiClient.get<CloudTenant>(`/cloud-tenants/${id}`).then(r => r.data),

  // Response includes `tempPassword` -- the SUPER_ADMIN temporary password,
  // returned exactly once (never persisted, never retrievable again). The
  // caller UI must surface it to the vendor-portal operator immediately.
  provision: (dto: ProvisionCloudTenantDto) =>
    apiClient.post<CloudTenant & { tempPassword: string }>('/cloud-tenants', dto).then(r => r.data),

  // Cloud Tenant Operations, Phase 10.1 -- null when the tenant never got
  // far enough to have an ZoeConnect provisioning run to look up (see backend
  // doc comment on getProvisioningHistory()).
  getHistory: (id: string) =>
    apiClient.get<ProvisioningHistory | null>(`/cloud-tenants/${id}/history`).then(r => r.data),

  // Cloud Tenant Operations, Phase 10.2.
  deprovision: (id: string) =>
    apiClient.post<CloudTenant>(`/cloud-tenants/${id}/deprovision`).then(r => r.data),

  // "Retry Provisioning" -- resumes the existing failed saga in place (see
  // backend CloudTenantsService.retry() doc comment). Response shape
  // matches provision()'s: includes a freshly generated `tempPassword`
  // exactly once, since resume() re-issues the SUPER_ADMIN password too.
  retry: (id: string) =>
    apiClient.post<CloudTenant & { tempPassword: string }>(`/cloud-tenants/${id}/retry`).then(r => r.data),

  // Pre-check the frontend calls before enabling the Retry button --
  // see backend CloudTenantsService.getRetryEligibility() doc comment.
  getRetryEligibility: (id: string) =>
    apiClient.get<{ allowed: boolean; reason?: string }>(`/cloud-tenants/${id}/retry-eligibility`).then(r => r.data),

  // Subdomain Release Lifecycle -- only valid on a DEPROVISIONED row that
  // hasn't been released yet (see backend doc comment). Deliberately
  // separate from deprovision(), never bundled into it.
  releaseSubdomain: (id: string) =>
    apiClient.post<CloudTenant>(`/cloud-tenants/${id}/release-subdomain`).then(r => r.data),

  // ── Connector Management (Task #102, "Vendor Portal Connector
  // Management," 2026-07-22) ──────────────────────────────────────────
  // "Activation Code" terminology throughout -- see
  // CONNECTOR_ACTIVATION_FLOW note on regenerateConnectorActivationCode()
  // below for why there is no separate "generate" call.

  getConnectorStatus: (id: string) =>
    apiClient.get<ConnectorStatus>(`/cloud-tenants/${id}/connector`).then(r => r.data),

  getConnectorActivity: (id: string, limit?: number) =>
    apiClient.get<ConnectorActivityEntry[]>(`/cloud-tenants/${id}/connector/activity`, { params: limit ? { limit } : undefined }).then(r => r.data),

  republishConnectorDefinitions: (id: string) =>
    apiClient.post<PublishSummary>(`/cloud-tenants/${id}/connector/republish`).then(r => r.data),

  resyncConnector: (id: string) =>
    apiClient.post<PublishSummary & { connectorId: string }>(`/cloud-tenants/${id}/connector/resync`).then(r => r.data),

  // Serves BOTH "Generate Activation Code" (no code exists yet) and
  // "Regenerate Activation Code" (one already exists) -- same backend
  // operation either way, see TenantProvisioningController's doc comment
  // on the ZoeConnect side. Response includes the raw `activationCode` exactly
  // once -- never persisted, never retrievable again after this call, same
  // "shown once" convention as `provision()`'s `tempPassword`.
  regenerateConnectorActivationCode: (id: string) =>
    apiClient.post<ActivationCodeResult>(`/cloud-tenants/${id}/connector/activation-code/regenerate`).then(r => r.data),

  // Not tenant-scoped -- one current installer build for every tenant.
  getConnectorInstaller: () =>
    apiClient.get<ConnectorInstaller>('/cloud-tenants/connector-installer').then(r => r.data),
};

// ── Connector Management types (Task #102) -- mirror the backend response
// shapes exactly (see cloud-tenants.service.ts on the vendor-portal
// backend, which itself mirrors ZoeConnect's TenantProvisioningController).

export type ConnectorStatus =
  | { registered: false }
  | {
      registered: true;
      connectorId: string;
      status: string;
      hostname: string | null;
      version: string | null;
      lastSeenAt: string | null;
      isConnected: boolean;
      registeredAt: string;
      definitions: { definitionCount: number; lastCompiledAt: string | null };
    };

export interface ConnectorActivityEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  newValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PublishSummary {
  ok: true;
  tenantId: string;
  changedQueryIds: string[];
  skippedQueryIds: string[];
  pushed: boolean;
}

export interface ActivationCodeResult {
  pairingId: string;
  activationCode: string;
  status: string;
  expiresAt: string;
}

export type ConnectorInstaller =
  | { available: false }
  | { available: true; version: string; downloadUrl: string; releaseNotes: string | null };
