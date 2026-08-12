// Cloud Tenant Onboarding, Phase B Step 6.
//
// Mirrors this repo's existing convention (see hospitals.service.ts's
// `ApproveRequestDto`/`RevokeDto`) of plain TypeScript interfaces used
// directly as DTOs, rather than class-validator decorated classes.
// ZoeConnect Identity Architecture Migration, Phase 6: subdomains are no
// longer part of the platform's identity/login architecture -- `subdomain`
// is now optional and, if supplied, kept only for historical/backward-
// compatibility purposes (never used for auth, uniqueness, or login URL
// generation). `adminUsername`/`adminEmail` are now the real global,
// case-insensitive uniqueness anchors -- see CloudTenantsService.provision().
export interface ProvisionCloudTenantDto {
  hospitalName: string;
  subdomain?: string;
  adminUsername: string;
  adminEmail: string;
  adminFullName?: string;
  subscriptionPlan?: string;
}
