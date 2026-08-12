import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'CANCELLED' as a valid `license_requests.status` value.
 *
 * Why: the settings/license page only let an admin withdraw a pending
 * request implicitly (there was no cancel action at all) -- once submitted,
 * a request stayed PENDING until the vendor acted on it, and
 * `uq_license_requests_single_pending_per_tenant` (PerTenantLicensingConstraints
 * migration) meant a hospital could not submit a corrected/updated request
 * without waiting for the vendor to reject the old one first. Adding a
 * self-service cancel lets the hospital withdraw its own pending request
 * immediately, freeing that same per-tenant "one pending" slot.
 *
 * The column itself is `varchar(32)` with no Postgres ENUM type, but IS
 * constrained by a CHECK constraint (`chk_license_req_status`, originally
 * added in CreateVendorSyncSchema1700000008000 and re-asserted verbatim in
 * ConsolidateRecentChanges1783326737784) -- so inserting 'CANCELLED' without
 * this migration would fail with a check-violation. This migration only
 * widens that CHECK constraint; it does not touch the
 * `uq_license_requests_single_pending_per_tenant` partial index (scoped to
 * `status = 'PENDING'`), since cancelling a request is exactly what should
 * free that slot -- no index change needed for that to work correctly.
 */
export class AddCancelledLicenseRequestStatus1788700000000 implements MigrationInterface {
  name = 'AddCancelledLicenseRequestStatus1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "license_requests" DROP CONSTRAINT IF EXISTS "chk_license_req_status"`);
    await queryRunner.query(`
      ALTER TABLE "license_requests"
      ADD CONSTRAINT "chk_license_req_status"
      CHECK (("status")::text = ANY ((ARRAY['PENDING','APPROVED','REJECTED','REVOKED','CANCELLED']::character varying[])::text[]))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Any row already marked CANCELLED would violate the narrower
    // constraint being restored -- reclassify them as REJECTED (the closest
    // pre-existing terminal status) rather than leaving an un-rollbackable
    // migration or silently deleting rows.
    await queryRunner.query(`
      UPDATE "license_requests" SET "status" = 'REJECTED',
        "rejection_reason" = COALESCE("rejection_reason", 'Reclassified from CANCELLED on migration rollback')
      WHERE "status" = 'CANCELLED'
    `);
    await queryRunner.query(`ALTER TABLE "license_requests" DROP CONSTRAINT IF EXISTS "chk_license_req_status"`);
    await queryRunner.query(`
      ALTER TABLE "license_requests"
      ADD CONSTRAINT "chk_license_req_status"
      CHECK (("status")::text = ANY ((ARRAY['PENDING','APPROVED','REJECTED','REVOKED']::character varying[])::text[]))
    `);
  }
}
