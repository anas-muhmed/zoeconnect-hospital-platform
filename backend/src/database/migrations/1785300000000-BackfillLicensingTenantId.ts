import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill tenant_id on pre-existing Licensing rows (Licensing Module
 * Tenant-Scoping Migration, Phase 2 of 6 -- see plan discussion).
 *
 * Problem this fixes: `vendor_registrations`, `license_master`, and
 * `license_requests` have all carried a nullable `tenant_id` column since
 * Tenant Foundation (Phase 1, Checkpoint A3), but nothing has ever written
 * to it -- every row created before this migration has `tenant_id = NULL`.
 * Phase 3 of this same plan wires these three entities into
 * `TenantScopedRepository`, whose read predicate is `WHERE tenant_id =
 * :currentTenantId` -- for a self-hosted install, `:currentTenantId`
 * resolves to the seeded 'default' tenant's real UUID, never NULL. Without
 * this backfill, every existing self-hosted customer's registration,
 * license, and request rows would silently stop matching any scoped query
 * the moment Phase 3 ships -- indistinguishable, from the customer's side,
 * from "you are no longer registered / no longer licensed" on upgrade day.
 *
 * Scope: self-hosted only, in effect. Every row in these three tables
 * today was created by a self-hosted instance (cloud provisioning has never
 * written to VendorRegistration/LicenseMaster/LicenseRequestEntity -- see
 * TenantProvisioningService.stepIssueTrialLicense(), which only ever
 * touches the separate SubscriptionLicense table). This migration only
 * ever stamps the single 'default' tenant's UUID, so it is a no-op change
 * in outcome for the single-tenant case it exists to protect, and touches
 * nothing for cloud (no pre-existing rows to backfill there).
 *
 * Idempotent: `WHERE tenant_id IS NULL` means re-running this migration
 * (or running it against a database that already has non-NULL tenant_id
 * values from some other source) only ever touches rows that still need
 * it, never overwrites an already-correct value.
 *
 * ROLLBACK NOTE: `down()` restores tenant_id to NULL only for rows this
 * migration itself would have touched (i.e. rows currently stamped with
 * the 'default' tenant's id) -- it does not attempt to distinguish "was
 * NULL before this migration ran" from "was already 'default' for some
 * unrelated reason" at rollback time, since no such distinction is
 * representable once the UPDATE has run. In practice this is safe because
 * nothing else in the codebase writes 'default' into these columns.
 * Rolling back is the correct action if Phase 3's TenantScopedRepository
 * wiring itself needs to be reverted (returning these tables to their
 * pre-migration, effectively-untenanted behavior); it is NOT needed to
 * "undo" any data loss, since no data is deleted or altered beyond this
 * one column.
 */
export class BackfillLicensingTenantId1785300000000 implements MigrationInterface {
  name = 'BackfillLicensingTenantId1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const defaultTenant: { id: string }[] = await queryRunner.query(
      `SELECT "id" FROM "tenant" WHERE "code" = 'default' LIMIT 1`,
    );
    if (!defaultTenant.length) {
      // Defensive only -- SeedDefaultTenant1783710000000 runs long before
      // this migration in the timestamp-ordered migration chain, so this
      // should be unreachable on any database that ran migrations in
      // order. Not throwing: a brand-new cloud-only database that somehow
      // skipped seeding still has zero rows in these three tables to
      // backfill anyway, so silently no-op-ing is correct, not risky.
      return;
    }
    const defaultTenantId = defaultTenant[0].id;

    await queryRunner.query(
      `UPDATE "vendor_registrations" SET "tenant_id" = $1 WHERE "tenant_id" IS NULL`,
      [defaultTenantId],
    );
    await queryRunner.query(
      `UPDATE "license_master" SET "tenant_id" = $1 WHERE "tenant_id" IS NULL`,
      [defaultTenantId],
    );
    await queryRunner.query(
      `UPDATE "license_requests" SET "tenant_id" = $1 WHERE "tenant_id" IS NULL`,
      [defaultTenantId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const defaultTenant: { id: string }[] = await queryRunner.query(
      `SELECT "id" FROM "tenant" WHERE "code" = 'default' LIMIT 1`,
    );
    if (!defaultTenant.length) return;
    const defaultTenantId = defaultTenant[0].id;

    await queryRunner.query(
      `UPDATE "vendor_registrations" SET "tenant_id" = NULL WHERE "tenant_id" = $1`,
      [defaultTenantId],
    );
    await queryRunner.query(
      `UPDATE "license_master" SET "tenant_id" = NULL WHERE "tenant_id" = $1`,
      [defaultTenantId],
    );
    await queryRunner.query(
      `UPDATE "license_requests" SET "tenant_id" = NULL WHERE "tenant_id" = $1`,
      [defaultTenantId],
    );
  }
}
