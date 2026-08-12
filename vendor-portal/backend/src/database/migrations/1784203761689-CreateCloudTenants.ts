import { MigrationInterface, QueryRunner } from "typeorm";

// Cloud Tenant Onboarding, Phase B Step 5
// (CLOUD_TENANT_ONBOARDING_DESIGN.md, Section 6a).
//
// New, standalone table -- does NOT touch `hospitals` in any way (no shared
// columns, no foreign key, no migration that alters `hospitals`). Guarded
// with the same `hasTable()` pattern as the three migrations before this one
// in case this environment's schema was created via `synchronize: true`
// rather than by running migrations in order.
export class CreateCloudTenants1784203761689 implements MigrationInterface {
    name = 'CreateCloudTenants1784203761689'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasTable = await queryRunner.hasTable('cloud_tenants');
        if (hasTable) {
            return;
        }
        await queryRunner.query(`
            CREATE TABLE "cloud_tenants" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "hospital_name" character varying(255) NOT NULL,
                "subdomain" character varying(64) NOT NULL,
                "hdsp_tenant_id" character varying(64),
                "admin_username" character varying(100) NOT NULL,
                "admin_email" character varying(255) NOT NULL,
                "login_url" character varying(512),
                "provisioning_status" character varying(32) NOT NULL DEFAULT 'PENDING',
                "provisioned_at" TIMESTAMPTZ,
                "provisioning_run_id" character varying(64),
                "subscription_plan" character varying(64),
                "failure_reason" text,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_cloud_tenants_subdomain" UNIQUE ("subdomain"),
                CONSTRAINT "PK_cloud_tenants_id" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasTable = await queryRunner.hasTable('cloud_tenants');
        if (!hasTable) {
            return;
        }
        await queryRunner.query(`DROP TABLE "cloud_tenants"`);
    }

}
