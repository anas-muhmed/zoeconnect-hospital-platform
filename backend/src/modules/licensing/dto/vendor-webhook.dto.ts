import { IsString, IsNotEmpty, IsIn, IsOptional, IsArray, IsDateString, IsObject, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type WebhookEventType =
  | 'LICENSE_APPROVED'
  | 'LICENSE_REVOKED'
  | 'MODULE_REVOKED'
  | 'TRIAL_EXTENDED'
  | 'REQUEST_REJECTED'
  | 'REGISTRATION_CONFIRMED'
  | 'HIS_CONFIG_UPDATE'
  | 'SYSTEM_SETTINGS_UPDATE';

export class VendorWebhookDto {
  @ApiProperty({
    enum: ['LICENSE_APPROVED','LICENSE_REVOKED','MODULE_REVOKED','TRIAL_EXTENDED','REQUEST_REJECTED','REGISTRATION_CONFIRMED','HIS_CONFIG_UPDATE', 'SYSTEM_SETTINGS_UPDATE'],
  })
  @IsIn(['LICENSE_APPROVED','LICENSE_REVOKED','MODULE_REVOKED','TRIAL_EXTENDED','REQUEST_REJECTED','REGISTRATION_CONFIRMED','HIS_CONFIG_UPDATE', 'SYSTEM_SETTINGS_UPDATE'])
  type: WebhookEventType;

  /** Present for LICENSE_APPROVED — full signed license JSON */
  @ApiPropertyOptional()
  @IsOptional()
  signedLicense?: Record<string, unknown>;

  /** Present for LICENSE_REVOKED / MODULE_REVOKED / REQUEST_REJECTED / TRIAL_EXTENDED */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  /** Present for LICENSE_REVOKED — if true, clear all active sessions */
  @ApiPropertyOptional()
  @IsOptional()
  forceLogout?: boolean;

  /**
   * Present for LICENSE_REVOKED — if true, the hospital record was deleted from
   * the vendor portal. ZoeConnect should wipe its vendor registration and restart as a
   * fresh trial installation.
   */
  @ApiPropertyOptional()
  @IsOptional()
  reset?: boolean;

  /** Present for MODULE_REVOKED — which modules to strip */
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modules?: string[];

  /** Present for TRIAL_EXTENDED */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  newExpiresAt?: string;

  /** Present for REQUEST_REJECTED */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorRequestId?: string;

  /** Vendor-assigned request ID echoed back on REGISTRATION_CONFIRMED */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instanceToken?: string;

  /** Hospital identifier — included as context in some vendor webhook payloads */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hospitalCode?: string;

  /** Hospital display name — included as context in some vendor webhook payloads */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hospitalName?: string;

  /**
   * Present for HIS_CONFIG_UPDATE — full key→value map of Oracle identifiers.
   * Example: { "billing.table": "BILL_MASTER", "patient.col.mrn": "UHID", ... }
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  hisConfig?: Record<string, string>;

  /**
   * Present for HIS_CONFIG_UPDATE — Oracle DB credentials for this hospital.
   * Keys: db.host, db.port, db.service, db.user, db.password, db.mode,
   *       db.pool.min, db.pool.max
   * When present, ZoeConnect tears down the existing Oracle pool and recreates it
   * with the new credentials. Missing / blank password key = keep existing.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  dbCredentials?: Record<string, string>;

  /**
   * Present for HIS_CONFIG_UPDATE — provisioned ZoeConnect user accounts.
   * ZoeConnect upserts these into its local users table (conflict on
   * (tenantId, username) — see Task 5's composite unique constraint).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  hdspUsers?: Array<{
    username:     string;
    passwordHash: string;
    role:         'ADMIN' | 'STAFF';
    fullName:     string | null;
    isActive:     boolean;
  }>;

  /**
   * Tenant-Scoped User Identity, Task 8 — the ZoeConnect `Tenant.id` UUID that
   * `hdspUsers` (and, in principle, `hisConfig`/`dbCredentials`) should be
   * applied to. Optional and omitted by every confirmed-live caller today:
   * self-hosted `Hospital` deployments (`HospitalsService
   * .pushHisConfigWithUsers()` in the vendor portal) are single-tenant by
   * construction — each runs its own isolated ZoeConnect backend + DB with only
   * the seeded 'default' tenant — so they have no real tenant UUID to send
   * and `HisConfigService.applyHdspUsers()` keeps falling back to
   * 'default' when this is absent, preserving today's behavior exactly.
   * This field exists so a future multi-tenant *cloud* sync path (once
   * built — `CloudTenantsService` has no HIS-sync feature yet, see
   * `CloudTenant.hdspTenantId`) can pass the correct tenant UUID and avoid
   * mis-tenanting users into 'default', which is what Task 8 closes.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  /**
   * Present for SYSTEM_SETTINGS_UPDATE — full key-value map of system settings.
   * Example: { "security.idleTimeoutMinutes": "30" }
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  systemSettings?: Record<string, string>;
}
