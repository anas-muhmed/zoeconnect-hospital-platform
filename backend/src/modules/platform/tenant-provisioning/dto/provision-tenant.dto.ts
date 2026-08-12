import {
  IsEmail, IsOptional, IsString, Matches, MinLength,
} from 'class-validator';

/**
 * ProvisionTenantDto (Phase 10, Task 10.7 — admin-facing provisioning API).
 *
 * This is an INTERNAL tool's request shape, not a customer self-service
 * signup form — per the user's Option 3 scope decision, Vendor Portal
 * self-service onboarding is deferred to PHASE_10_DEFERRED_BACKLOG.md.
 * Today, a platform operator (or the Vendor Portal calling on an
 * operator's behalf, unchanged in this phase) supplies these fields.
 */
export class ProvisionTenantDto {
  @IsString()
  @MinLength(2)
  hospitalName: string;

  /**
   * ZoeConnect Identity Architecture Migration, Phase 6: subdomains are no
   * longer part of the platform's identity or login architecture -- every
   * organization now shares the single login URL at
   * `app.publicLoginUrl` regardless of this value. This field is now
   * OPTIONAL and purely historical: if supplied, it is still recorded on
   * the `Tenant` row (see TenantProvisioningService.stepCreateTenantRow)
   * for backward-compatibility/reporting purposes only. It is never used
   * for authentication, uniqueness enforcement, or login URL generation.
   * When absent, the tenant's `code` is derived from `hospitalName`
   * instead (see TenantProvisioningService.slugifyCode).
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, {
    message: 'subdomain must be a valid DNS label (lowercase letters, digits, hyphens)',
  })
  subdomain?: string;

  @IsString()
  @MinLength(3)
  adminUsername: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(8)
  adminPassword: string;

  @IsOptional()
  @IsString()
  adminFullName?: string;

  /** Audit trail only (who/what called the admin API) — not used for authorization. */
  @IsOptional()
  @IsString()
  triggeredBy?: string;
}
