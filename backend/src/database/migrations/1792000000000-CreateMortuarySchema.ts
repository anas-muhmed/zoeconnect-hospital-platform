import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * zoe-platform Mortuary integration (Phase 2, Stage B).
 *
 * Creates the 14 `mortuary_*` tables backing the entities added in Stage A
 * (`backend/src/modules/mortuary/entities/`). Additive-only — no existing
 * table is touched. No data migration; no zoe-platform database is
 * touched or connected to by this migration.
 *
 * Ported from zoe-platform's Mortuary schema
 * (`src/modules/mortuary/migrations/001-004_*.sql`), verified column by
 * column against those four files. Six deliberate, documented deviations
 * from the literal source schema were made — see Stage B's migration
 * review for full rationale on each:
 *
 *  D1. `tenant_id` is NOT NULL + `REFERENCES "tenant"("id") ON DELETE
 *      RESTRICT` on every tenant-scoped table (source: nullable, no FK,
 *      on every table it appears on) -- required for
 *      TenantScopedRepository to be meaningful; matches the convention
 *      already established by CreateBillingSchema/CreateOrganizationBranches.
 *  D2. `cabinNumber`, `bodyNumber`, `employeeId` move from source's flat
 *      GLOBAL UNIQUE to UNIQUE ("tenant_id", column) -- multiple hospitals
 *      independently numbering cabins/bodies/staff the same way is
 *      expected, not a conflict, once this is genuinely multi-tenant.
 *  D3. `client_id` (hospital profile) and `body_types.name` remain flat
 *      GLOBAL UNIQUE -- both are meant to be distinct across every tenant
 *      by design (client_id identifies the hospital itself; body_types is
 *      the shared global lookup -- see D5's note on that table).
 *  D4. NO new FK constraints between Mortuary's own domain tables
 *      (body/cabin/allocation/billing/service/etc.) -- the source schema
 *      had none at all between these tables (verified: no REFERENCES
 *      clause anywhere in 001_create_schema_and_tables.sql beyond primary
 *      keys), so none are introduced here either, to avoid silently
 *      changing insert/delete behavior the original app may depend on.
 *      The two exceptions are D1 (tenant_id) and
 *      `mortuary_staff_profiles.user_id -> users(id)`, which is a
 *      genuinely NEW relationship this integration introduces (Mortuary
 *      staff identity now lives in ZoeConnect's `users` table, not its
 *      own table) rather than a pre-existing one being changed.
 *  D5. `mortuary_body_types` has NO `tenant_id` at all -- verified against
 *      002_add_columns.sql's full hospital_id backfill list, `body_types`
 *      is the one table never given `hospital_id` in the source. Global
 *      reference data, not tenant data.
 *  D6. Enum-shaped columns (`cabin_type`, `department`, `approval_status`,
 *      `pricing_model`) are backed by native Postgres ENUM types (matching
 *      Stage A's entities and this repo's own `tenant_status_enum`
 *      precedent), not the source's VARCHAR + CHECK style.
 *
 * Everything else (nullability, defaults, column types/precision, which
 * columns are optional) is preserved exactly as the source schema,
 * verified against 001/002/003's actual `NOT NULL`/`DEFAULT` clauses
 * column by column, not re-derived from assumption.
 */
export class CreateMortuarySchema1792000000000 implements MigrationInterface {
  name = 'CreateMortuarySchema1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum types (D6) ──────────────────────────────────────────────────
    await queryRunner.query(`CREATE TYPE "mortuary_cabin_type_enum" AS ENUM ('FREEZER', 'NORMAL_CABIN');`);
    await queryRunner.query(`CREATE TYPE "mortuary_department_enum" AS ENUM ('M Staff', 'House Keeping');`);
    await queryRunner.query(`CREATE TYPE "mortuary_approval_status_enum" AS ENUM ('pending', 'approved', 'rejected');`);
    await queryRunner.query(`CREATE TYPE "mortuary_pricing_model_enum" AS ENUM ('tiered_flat_hourly', 'flat_daily', 'free');`);

    // ── mortuary_hospital_profiles (ports `hospitals`, minus name/status → Tenant) ──
    await queryRunner.query(`
      CREATE TABLE "mortuary_hospital_profiles" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"        uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "client_id"        varchar(50),
        "logo_object_key"  text,
        "contact_email"    varchar(150),
        "contact_phone"    varchar(20),
        "address"          text,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_mortuary_hospital_profiles_tenant" UNIQUE ("tenant_id"),
        CONSTRAINT "uq_mortuary_hospital_profiles_client_id" UNIQUE ("client_id")
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_hospital_profiles_tenant" ON "mortuary_hospital_profiles" ("tenant_id");`);

    // ── mortuary_system_settings (ports `system_settings`) ──────────────
    await queryRunner.query(`
      CREATE TABLE "mortuary_system_settings" (
        "id"                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"                   uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "mortuary_name"                varchar(255) DEFAULT 'MOSC Medical College Mortuary',
        "mortuary_logo_object_key"     text,
        "first_day_charge"             numeric(10,2) NOT NULL DEFAULT 2100.00,
        "hourly_charge_after_24hrs"    numeric(10,2) NOT NULL DEFAULT 130.00,
        "pricing_model"                "mortuary_pricing_model_enum" NOT NULL DEFAULT 'tiered_flat_hourly',
        "daily_rate"                   numeric(10,2) DEFAULT 500.00,
        "staff_discount_percent"       numeric(5,2) NOT NULL DEFAULT 100,
        "updated_by"                   varchar(255),
        "updated_at"                   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_mortuary_system_settings_tenant" UNIQUE ("tenant_id")
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_system_settings_tenant" ON "mortuary_system_settings" ("tenant_id");`);

    // ── mortuary_staff_profiles (extension fields only — see D4; ports the
    //    Mortuary-specific columns of `users`, NOT the whole table) ──────
    await queryRunner.query(`
      CREATE TABLE "mortuary_staff_profiles" (
        "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"                   uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tenant_id"                 uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "employee_id"               varchar(100) NOT NULL,
        "department"                "mortuary_department_enum" NOT NULL,
        "phone1"                    varchar(20),
        "phone2"                    varchar(20),
        "approval_status"           "mortuary_approval_status_enum" NOT NULL DEFAULT 'pending',
        "admin_remarks"             varchar(500),
        "password_reset_requested"  boolean NOT NULL DEFAULT false,
        "created_at"                timestamptz NOT NULL DEFAULT now(),
        "updated_at"                timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_mortuary_staff_profiles_user" UNIQUE ("user_id"),
        CONSTRAINT "uq_mortuary_staff_profiles_tenant_employee" UNIQUE ("tenant_id", "employee_id")
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_staff_profiles_tenant" ON "mortuary_staff_profiles" ("tenant_id");`);

    // ── mortuary_body_types (D5 — GLOBAL, no tenant_id) ──────────────────
    await queryRunner.query(`
      CREATE TABLE "mortuary_body_types" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"        varchar(100) NOT NULL,
        "description" text,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_mortuary_body_types_name" UNIQUE ("name")
      );
    `);

    // ── mortuary_concession_authorities ──────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "mortuary_concession_authorities" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"             uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "name"                  varchar(255) NOT NULL,
        "designation"           varchar(255),
        "department"            varchar(255),
        "max_discount_percent"  real DEFAULT 100,
        "is_active"             boolean DEFAULT true,
        "created_at"            timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_concession_authorities_tenant" ON "mortuary_concession_authorities" ("tenant_id");`);

    // ── mortuary_bodies ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "mortuary_bodies" (
        "id"                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"                     uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "body_number"                   varchar(50) NOT NULL,
        "body_type"                     varchar(50) NOT NULL,
        "hospital_number"               varchar(100),
        "patient_name"                  varchar(255),
        "gender"                        varchar(20),
        "age"                           integer,
        "locality"                      varchar(255),
        "date_of_death"                 varchar(50),
        "time_of_death"                 varchar(50),
        "declared_by"                   varchar(255),
        "reason_of_death"               text,
        "death_intimation_no"           varchar(100),
        "mlc_no"                        varchar(100),
        "estimated_days_of_stay"        integer,
        "witness1_name"                 varchar(255),
        "witness1_address"              text,
        "witness1_contact"              varchar(50),
        "witness2_name"                 varchar(255),
        "witness2_address"              text,
        "witness2_contact"              varchar(50),
        "billing_status"                varchar(50) DEFAULT 'PENDING',
        "status"                        varchar(50) DEFAULT 'Registered',
        "police_station_name"           varchar(255),
        "station_si_name"               varchar(255),
        "present_police_officer_name"   varchar(255),
        "noc_certificate_object_key"    text,
        "freezer_required"              smallint DEFAULT 1,
        "created_at"                    timestamptz NOT NULL DEFAULT now(),
        "updated_at"                    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_mortuary_bodies_tenant_number" UNIQUE ("tenant_id", "body_number")
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_bodies_tenant" ON "mortuary_bodies" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_bodies_status" ON "mortuary_bodies" ("status");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_bodies_billing_status" ON "mortuary_bodies" ("billing_status");`);

    // ── mortuary_cabins ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "mortuary_cabins" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"    uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "cabin_number" varchar(50) NOT NULL,
        "status"       varchar(50) DEFAULT 'Available',
        "tariff"       real DEFAULT 500,
        "daily_rate"   numeric(10,2) DEFAULT 500.00,
        "floor"        integer DEFAULT 1,
        "cabin_type"   "mortuary_cabin_type_enum" DEFAULT 'NORMAL_CABIN',
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_mortuary_cabins_tenant_number" UNIQUE ("tenant_id", "cabin_number")
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_cabins_tenant" ON "mortuary_cabins" ("tenant_id");`);

    // ── mortuary_service_master ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "mortuary_service_master" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"    uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "service_name" varchar(255) NOT NULL,
        "tariff"       numeric(10,2) NOT NULL DEFAULT 0.00,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_service_master_tenant" ON "mortuary_service_master" ("tenant_id");`);

    // ── mortuary_cabin_allocations (body_id/cabin_id: plain indexed uuid, no FK — see D4) ──
    await queryRunner.query(`
      CREATE TABLE "mortuary_cabin_allocations" (
        "id"                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"                     uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "body_id"                       uuid NOT NULL,
        "cabin_id"                      uuid NOT NULL,
        "admission_date_time"           timestamp DEFAULT CURRENT_TIMESTAMP,
        "release_date_time"             timestamp,
        "estimated_release_date_time"   timestamp,
        "advance_amount"                real DEFAULT 0,
        "hourly_rate"                   real DEFAULT 50,
        "min_hours"                     integer DEFAULT 4,
        "free_hours"                    integer DEFAULT 0,
        "status"                        varchar(50) DEFAULT 'Allocated',
        "created_at"                    timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_cabin_allocations_tenant" ON "mortuary_cabin_allocations" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_cabin_allocations_body" ON "mortuary_cabin_allocations" ("body_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_cabin_allocations_cabin" ON "mortuary_cabin_allocations" ("cabin_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_cabin_allocations_status" ON "mortuary_cabin_allocations" ("status");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_cabin_allocations_admission" ON "mortuary_cabin_allocations" ("admission_date_time");`);

    // ── mortuary_billing (body_id/cabin_allocation_id/concession_authority_id: no FK — see D4) ──
    await queryRunner.query(`
      CREATE TABLE "mortuary_billing" (
        "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"                uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "body_id"                  uuid NOT NULL,
        "cabin_allocation_id"      uuid,
        "total_amount"             real DEFAULT 0,
        "discount_amount"          real DEFAULT 0,
        "discount_reason"          text,
        "concession_authority_id"  uuid,
        "net_amount"               real DEFAULT 0,
        "services_amount"          real DEFAULT 0,
        "status"                   varchar(50) DEFAULT 'Pending',
        "settled_at"               timestamp,
        "first_day_charge"         numeric(10,2),
        "extra_hours"              integer,
        "hourly_rate"              numeric(10,2),
        "additional_hour_charges"  numeric(10,2),
        "total_hours"              integer,
        "advance_amount"           numeric(10,2),
        "staff_concession"         smallint DEFAULT 0,
        "staff_name"               varchar(255),
        "staff_employee_id"        varchar(100),
        "staff_address"            text,
        "staff_phone"              varchar(20),
        "staff_relation"           varchar(100),
        "created_at"               timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_billing_tenant" ON "mortuary_billing" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_billing_body" ON "mortuary_billing" ("body_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_billing_status" ON "mortuary_billing" ("status");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_billing_created_at" ON "mortuary_billing" ("created_at");`);

    // ── mortuary_billing_services (billing_id/service_id: no FK — see D4) ──
    await queryRunner.query(`
      CREATE TABLE "mortuary_billing_services" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"     uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "billing_id"    uuid NOT NULL,
        "service_id"    uuid,
        "service_name"  varchar(255) NOT NULL,
        "amount"        real NOT NULL,
        "created_at"    timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_billing_services_tenant" ON "mortuary_billing_services" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_billing_services_billing" ON "mortuary_billing_services" ("billing_id");`);

    // ── mortuary_service_billing (body_id/billing_id/service_id: no FK — see D4) ──
    await queryRunner.query(`
      CREATE TABLE "mortuary_service_billing" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"         uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "body_id"           uuid NOT NULL,
        "billing_id"        uuid,
        "service_id"        uuid,
        "service_name"      varchar(255) NOT NULL,
        "service_amount"    numeric(10,2) NOT NULL DEFAULT 0.00,
        "discount_amount"   numeric(10,2) NOT NULL DEFAULT 0.00,
        "net_amount"        numeric(10,2) NOT NULL DEFAULT 0.00,
        "status"            varchar(50) DEFAULT 'Pending',
        "created_at"        timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_service_billing_tenant" ON "mortuary_service_billing" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_service_billing_body" ON "mortuary_service_billing" ("body_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_service_billing_billing" ON "mortuary_service_billing" ("billing_id");`);

    // ── mortuary_body_releases (body_id: no FK — see D4) ─────────────────
    await queryRunner.query(`
      CREATE TABLE "mortuary_body_releases" (
        "id"                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"                     uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "body_id"                       uuid NOT NULL,
        "release_type"                  varchar(50) NOT NULL,
        "taken_by"                      varchar(255),
        "relationship"                  varchar(100),
        "address"                       text,
        "contact_number"                varchar(50),
        "police_station"                varchar(255),
        "si_name"                       varchar(255),
        "noc_document_object_key"       text,
        "legal_documents_object_key"    text,
        "release_date_time"             timestamp DEFAULT CURRENT_TIMESTAMP,
        "created_at"                    timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_body_releases_tenant" ON "mortuary_body_releases" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_body_releases_body" ON "mortuary_body_releases" ("body_id");`);

    // ── mortuary_housekeeping_tasks (cabin_id: no FK — see D4) ───────────
    await queryRunner.query(`
      CREATE TABLE "mortuary_housekeeping_tasks" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"     uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "cabin_id"      uuid NOT NULL,
        "status"        varchar(50) DEFAULT 'PENDING',
        "assigned_to"   varchar(255),
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "updated_at"    timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_housekeeping_tasks_tenant" ON "mortuary_housekeeping_tasks" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_mortuary_housekeeping_tasks_cabin" ON "mortuary_housekeeping_tasks" ("cabin_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse dependency order. DROP TABLE cascades to that table's own
    // indexes/constraints automatically — no separate DROP INDEX needed.
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_housekeeping_tasks";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_body_releases";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_service_billing";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_billing_services";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_billing";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_cabin_allocations";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_service_master";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_cabins";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_bodies";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_concession_authorities";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_body_types";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_staff_profiles";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_system_settings";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mortuary_hospital_profiles";`);

    await queryRunner.query(`DROP TYPE IF EXISTS "mortuary_pricing_model_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mortuary_approval_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mortuary_department_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mortuary_cabin_type_enum";`);
  }
}
