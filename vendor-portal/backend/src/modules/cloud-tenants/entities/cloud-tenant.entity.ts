import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

// Cloud Tenant Onboarding (CLOUD_TENANT_ONBOARDING_DESIGN.md, Section 6a).
//
// Deliberately a SEPARATE table from `hospitals` (see hospital.entity.ts) --
// `hospitals` is structurally self-hosted-specific (NOT NULL instance_token/
// instance_secret/public_ip/public_port/webhook_url/machine_fingerprint,
// none of which exist for a cloud tenant provisioned directly by the Vendor
// Portal against ZoeConnect's multi-tenant cloud deployment). This table is the
// Vendor Portal's own reference record for a cloud tenant, populated from
// ZoeConnect's provisioning response -- it does not pair with a self-hosted
// instance the way `hospitals` rows do.
export type CloudTenantProvisioningStatus =
  | 'PENDING'
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'FAILED'
  // Cloud Tenant Operations, Phase 10.2 -- set by CloudTenantsService
  // .deprovision(), which proxies ZoeConnect's existing (previously-unwired)
  // deprovision endpoint. Terminal, like FAILED: no code path transitions
  // a DEPROVISIONED row back to ACTIVE (matches ZoeConnect's own "pilot
  // rollback, not full lifecycle" scope for the underlying action).
  | 'DEPROVISIONED'
  // Retry Provisioning concurrency guard (2026-08, code review follow-up)
  // -- an extremely short-lived transitional status. CloudTenantsService
  // .retry() flips a row from FAILED to RETRYING with a single atomic,
  // conditional UPDATE (`WHERE provisioning_status = 'FAILED'`) before
  // calling provision(), so that if two retry requests race (double-click,
  // two operators), only one UPDATE actually matches a row -- the second
  // affects zero rows and is rejected with a clear "already being retried"
  // error instead of both concurrently resuming the same ZoeConnect saga.
  // provision() itself immediately overwrites RETRYING with PENDING then
  // PROVISIONING once it starts running (see its own `existing` handling),
  // so this value is normally only observable for the few milliseconds
  // between the claim and provision() picking the row back up -- a plain
  // varchar column under `synchronize: true`, so adding this value needs
  // no migration.
  | 'RETRYING';

// Subdomain Release Lifecycle -- declared here, not left to the migration
// alone, because this database runs with `synchronize: true`
// (database.config.ts): on every app boot, TypeORM reconciles the live
// schema against THIS entity's metadata and drops anything it finds in
// the DB that isn't represented here. Without this decorator, the
// migration-created partial unique index would look like an "extra,
// unmanaged" index to synchronize and get silently dropped on the very
// next restart. Name matches 1785200000000-SubdomainReleaseLifecycle.ts's
// index exactly so synchronize recognizes the migration's index as
// already satisfying this declaration instead of trying to recreate it.
@Index('UQ_cloud_tenants_subdomain_unreleased', ['subdomain'], {
  unique: true,
  where: '"subdomain_released_at" IS NULL',
})
@Entity('cloud_tenants')
export class CloudTenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'hospital_name', type: 'varchar', length: 255 })
  hospitalName: string;

  // Subdomain Release Lifecycle -- no longer unconditionally unique at the
  // DB level (see 1785200000000-SubdomainReleaseLifecycle.ts): multiple
  // rows CAN share a subdomain value now, as long as at most one of them
  // has `subdomainReleasedAt` still NULL (i.e. still "claims" it). Real
  // enforcement of "only one live claim per subdomain" now lives in
  // `CloudTenantsService.provision()`'s own lookup logic, not this column
  // decorator -- see that method's doc comment.
  //
  // ZoeConnect Identity Architecture Migration, Phase 6: nullable as of this
  // phase -- subdomains are no longer required or used for organization
  // identity/login. Preserved for historical/backward-compatibility display
  // only when a caller still supplies one; `adminEmail`/`adminUsername` are
  // now the real correlation key for retry/resume logic (see provision()).
  @Column({ name: 'subdomain', type: 'varchar', length: 64, nullable: true })
  subdomain: string | null;

  // Mirrors ZoeConnect's own `Tenant.subdomainReleasedAt` (Subdomain Release
  // Lifecycle) -- set only via CloudTenantsService.releaseSubdomain(),
  // which calls ZoeConnect's release endpoint first and only stamps this local
  // copy on success, so the two stay in sync. NULL means this row still
  // "claims" its subdomain (including the entire deprovisioned-but-
  // unreleased period); non-null means a different tenant is free to
  // provision under the same subdomain string. Deliberately never reset
  // back to NULL -- irreversible, matching ZoeConnect's own posture.
  @Column({ name: 'subdomain_released_at', type: 'timestamptz', nullable: true })
  subdomainReleasedAt: Date | null;

  // Null until ZoeConnect's provisioning response returns it (PENDING/PROVISIONING
  // states; see buildProvisioningSummary() on the ZoeConnect side).
  @Column({ name: 'hdsp_tenant_id', type: 'varchar', length: 64, nullable: true })
  hdspTenantId: string | null;

  // Cloud Licensing API (architecture review, 2026-07-29). Captured once,
  // straight from ZoeConnect's provisioning response (`summary.instanceSecret`
  // -- see buildProvisioningSummary() on the ZoeConnect side), the same way
  // hdspTenantId/loginUrl already are. This is the HMAC key
  // HospitalsService.approveRequest() signs its Cloud Licensing API calls
  // with for THIS tenant (PUT /platform/licensing/tenants/:hdspTenantId
  // /subscription) -- the cloud counterpart of a self-hosted Hospital row's
  // `instanceSecret` (hospital.entity.ts), just stored here instead since a
  // cloud tenant's linked `Hospital` row has no instance to pair with (see
  // that entity's own doc comment). Never sent back to the browser/admin UI
  // -- server-to-server use only.
  @Column({ name: 'instance_secret', type: 'varchar', length: 128, nullable: true })
  instanceSecret: string | null;

  // Allow Cloud Tenants to Submit License Requests (2026-07-30) -- the SAME
  // VendorRegistration.instanceToken ZoeConnect generated for this tenant
  // during provisioning (stepIssueTrialLicense(), surfaced once via
  // buildProvisioningSummary()'s `summary.instanceToken` -- see provision()
  // above), captured here so this table can answer "which cloud tenant is
  // this instance token for" the same way HospitalsService.createRequest()
  // already answers it for a self-hosted Hospital row via its own
  // `instanceToken` column. Before this, ZoeConnect's own
  // VendorSyncService.submitRequest() had no real Vendor Portal counterpart
  // to authenticate against for cloud tenants (this column stayed null),
  // so cloud license requests were silently mocked instead of actually sent
  // -- see HospitalsService.createRequest()'s CloudTenant-lookup fallback,
  // used when the direct Hospital-by-instanceToken lookup misses (a cloud
  // Hospital row's own `instanceToken` is always null, see that column's
  // doc comment on hospital.entity.ts).
  @Column({ name: 'instance_token', type: 'varchar', length: 64, nullable: true })
  instanceToken: string | null;

  @Column({ name: 'admin_username', type: 'varchar', length: 100 })
  adminUsername: string;

  @Column({ name: 'admin_email', type: 'varchar', length: 255 })
  adminEmail: string;

  @Column({ name: 'login_url', type: 'varchar', length: 512, nullable: true })
  loginUrl: string | null;

  @Column({
    name: 'provisioning_status',
    type: 'varchar',
    length: 32,
    default: 'PENDING',
  })
  provisioningStatus: CloudTenantProvisioningStatus;

  // Nullable -- set only when provisioning_status transitions to ACTIVE
  // (i.e. the moment ZoeConnect's provisioning response is successfully persisted).
  @Column({ name: 'provisioned_at', type: 'timestamptz', nullable: true })
  provisionedAt: Date | null;

  // ZoeConnect's own TenantProvisioningRun.id (see tenant-provisioning-run.entity.ts
  // on the ZoeConnect side) -- kept for audit/troubleshooting cross-reference only,
  // not a foreign key (separate databases).
  @Column({ name: 'provisioning_run_id', type: 'varchar', length: 64, nullable: true })
  provisioningRunId: string | null;

  @Column({ name: 'subscription_plan', type: 'varchar', length: 64, nullable: true })
  subscriptionPlan: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
