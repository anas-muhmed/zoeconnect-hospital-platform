import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customers merge (Phase 2, 2026-07-20) -- Vendor Portal side.
 *
 * Context: `hospitals` (self-hosted's rich management table -- license,
 * ZoeConnect user credentials, HIS config, system settings, suspend/activate/
 * revoke) and `cloud_tenants` (provisioning lifecycle only -- list/
 * provision/deprovision/history) were two completely disconnected tables.
 * A cloud tenant provisioned via CloudTenantsService.provision() had no
 * ongoing management surface anywhere in Vendor Portal -- it was orphaned
 * the moment provisioning finished.
 *
 * Fix: add `deployment_type` + `cloud_tenant_id` to `hospitals` so a cloud
 * tenant gets a real row there too (see CloudTenantsService's new
 * `linkHospitalRecord()`, called on successful provisioning), reusing
 * HospitalsController's entire existing license/user/HIS-config/settings
 * surface instead of duplicating it under `cloud-tenants`. `cloud_tenants`
 * itself is unchanged and keeps owning the provisioning lifecycle
 * (subdomain claims, ZoeConnect run history, deprovision/release) -- this is a
 * link between the two tables, not a replacement of either.
 *
 * The self-hosted-only columns (instance_token/instance_secret/public_ip/
 * webhook_url/machine_fingerprint) are relaxed to nullable: a cloud row has
 * none of these (no physical instance to pair with). Every existing
 * self-hosted row already has real values in all of them, so this is a
 * pure widening -- no data changes, no behavior change for self-hosted.
 *
 * IF NOT EXISTS / DROP NOT NULL guards throughout: this database runs with
 * `synchronize: true` (database.config.ts), and Hospital's entity metadata
 * now declares these same columns/nullability -- an app boot that races
 * this migration may already have applied some of it.
 */
export class CustomersMerge1785700000000 implements MigrationInterface {
  name = 'CustomersMerge1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('hospitals');
    if (!hasTable) return;

    await queryRunner.query(`
      ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "deployment_type" VARCHAR(16) NOT NULL DEFAULT 'self_hosted';
    `);
    await queryRunner.query(`
      ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "cloud_tenant_id" UUID NULL;
    `);

    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "instance_token" DROP NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "instance_secret" DROP NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "public_ip" DROP NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "public_port" DROP NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "webhook_url" DROP NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "machine_fingerprint" DROP NOT NULL;`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_hospitals_cloud_tenant_id" ON "hospitals" ("cloud_tenant_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('hospitals');
    if (!hasTable) return;

    // Reversing DROP NOT NULL would fail if any cloud row (created after
    // this migration ran) exists with NULLs in these columns -- that's the
    // correct failure mode (matches this repo's existing down() convention
    // of failing loudly rather than silently corrupting data), not
    // something to work around here.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_hospitals_cloud_tenant_id";`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "machine_fingerprint" SET NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "webhook_url" SET NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "public_port" SET NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "public_ip" SET NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "instance_secret" SET NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" ALTER COLUMN "instance_token" SET NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "hospitals" DROP COLUMN IF EXISTS "cloud_tenant_id";`);
    await queryRunner.query(`ALTER TABLE "hospitals" DROP COLUMN IF EXISTS "deployment_type";`);
  }
}
