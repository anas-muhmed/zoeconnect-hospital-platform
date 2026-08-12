import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Identity Architecture Migration, Phase 6.
 *
 * Small, targeted schema change -- deliberately NOT the larger subdomain
 * cleanup the user explicitly deferred to a future phase ("Do not perform a
 * large schema cleanup in this phase. We can remove obsolete subdomain
 * fields in a future cleanup once the migration has been proven stable.").
 *
 * `tenant_provisioning_runs.requested_subdomain` was `NOT NULL` (see
 * `1783840000000-CreateTenantProvisioning.ts`), which is no longer
 * compatible with `ProvisionTenantDto.subdomain` becoming optional this
 * phase -- subdomains are no longer part of the platform's identity or
 * login architecture, so most new provisioning runs will have nothing to
 * put in this column. Existing rows are untouched (their historical
 * subdomain value is preserved exactly as-is); this migration only relaxes
 * the constraint so future inserts may omit it.
 *
 * `tenants.subdomain` itself is already `nullable: true` (added by an
 * earlier phase) and needs no change here.
 */
export class MakeProvisioningSubdomainOptional1788600000000 implements MigrationInterface {
  name = 'MakeProvisioningSubdomainOptional1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_provisioning_runs"
      ALTER COLUMN "requested_subdomain" DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Not safely reversible in general (existing null rows would violate a
    // restored NOT NULL constraint) -- intentionally a no-op rather than a
    // constraint restore that could fail on real data. Matches this
    // codebase's existing convention of documenting rather than forcing a
    // destructive/lossy down() (see e.g. GlobalIdentityUniqueness's own
    // down() for the opposite case where reversal IS safe).
  }
}
