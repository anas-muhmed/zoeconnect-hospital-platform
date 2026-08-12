import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vendor Registration Singleton Enforcement.
 *
 * Problem: `VendorSyncService.register()` and `.internalProvision()`
 * (license.controller.ts / vendor-sync.service.ts) both enforce "at most
 * one vendor_registrations row, ever" purely at the application layer —
 * check-then-insert via `getRegistration()`. Two concurrent calls (a
 * retried provisioning request racing the original, a duplicate
 * vendor-portal callback, etc.) can both pass the `existing` check before
 * either commits, producing two rows. That silently breaks
 * `getRegistration()` (arbitrarily picks the most recent by
 * `registered_at`), `verifyWebhookSignature()` (HMACs against whichever row
 * that resolves to), and `validateInstanceToken()` (matches against a
 * specific row, not "the" row) — three different call sites each picking a
 * different notion of "the" registration.
 *
 * Fix: a partial unique index on a constant expression, scoped to
 * `status = 'ACTIVE'` — the same singleton-enforcement pattern already
 * used elsewhere in this schema for a different invariant (see
 * 1785100000000-TenantSubdomainReleaseLifecycle.ts). Guarantees at most one
 * ACTIVE row can exist at the database level, closing the race without
 * changing either call site's normal-case behavior — both already only
 * ever expect one row; `instance_token`'s pre-existing unique constraint
 * (uq_instance_token, CreateVendorSyncSchema1700000008000) only prevents
 * *identical-token* duplicates, not two different registrations both
 * created by a race.
 *
 * Data safety: if duplicate ACTIVE rows already exist (e.g. from this
 * exact race happening before this migration ran), creating the index
 * would fail outright. `up()` first de-duplicates non-destructively —
 * keeping the most-recently-registered ACTIVE row and demoting any others
 * to SUSPENDED — rather than deleting anything, consistent with this
 * schema's existing philosophy of never discarding registration history
 * (see 1785100000000's deprovision-never-deletes rationale). Demoted rows
 * keep every column (instance_token, instance_secret, etc.) for audit
 * purposes; only `status` changes.
 */
export class VendorRegistrationSingletonEnforcement1785200000000 implements MigrationInterface {
  name = 'VendorRegistrationSingletonEnforcement1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // De-duplicate any pre-existing concurrent-race rows before the unique
    // index below would otherwise fail to create.
    await queryRunner.query(`
      UPDATE "vendor_registrations" SET "status" = 'SUSPENDED'
      WHERE "status" = 'ACTIVE' AND "id" NOT IN (
        SELECT "id" FROM "vendor_registrations" WHERE "status" = 'ACTIVE'
        ORDER BY "registered_at" DESC LIMIT 1
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_vendor_registrations_single_active"
      ON "vendor_registrations" ((true))
      WHERE "status" = 'ACTIVE';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vendor_registrations_single_active"`);
  }
}
