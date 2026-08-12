import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

/**
 * CheckProvisioningAvailabilityDto (Tenant-Scoped User Identity, Task 9).
 *
 * Deliberately mirrors `ProvisionTenantDto`'s `subdomain`/`adminUsername`/
 * `adminEmail` shape (not renamed) so Vendor Portal can pass the same form
 * values it's about to submit to `POST /platform/tenant-provisioning`
 * without remapping fields. `hisEmployeeCode` has no equivalent in
 * `ProvisionTenantDto` at all -- a new tenant's SUPER_ADMIN is never created
 * with one at provisioning time (HIS mapping happens later, out of this
 * flow's scope) -- included here only because the plan's Task 9 write-up
 * named it explicitly; see the service method's doc comment for why it's
 * checked as a global advisory scan, not a real per-tenant collision.
 */
export class CheckProvisioningAvailabilityDto {
  /**
   * ZoeConnect Identity Architecture Migration, Phase 6: subdomains are no
   * longer part of the platform's identity architecture, so this is no
   * longer the field this endpoint blocks provisioning on. Now optional
   * and purely advisory/historical -- see
   * TenantProvisioningService.checkAvailability(), where `adminUsername`/
   * `adminEmail` (checked globally, case-insensitively) are now the real
   * blocking checks.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, {
    message: 'subdomain must be a valid DNS label (lowercase letters, digits, hyphens)',
  })
  subdomain?: string;

  /** Now a blocking check -- see checkAvailability(). Global, case-insensitive (Phase 4/6). */
  @IsOptional()
  @IsString()
  adminUsername?: string;

  /** Now a blocking check -- see checkAvailability(). Global, case-insensitive (Phase 4/6). */
  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @IsOptional()
  @IsString()
  hisEmployeeCode?: string;
}
