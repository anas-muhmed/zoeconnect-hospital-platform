import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drug Indenting integration (ZoeConnect delivery phase).
 *
 * Ported from zoe-platform's `src/modules/drug-indenting/migrations/
 * 001_initial_schema.sql`, verified column-by-column. No data migration;
 * no zoe-platform database touched.
 *
 * Deliberate divergences from the literal source, each evidence-based:
 *
 *  D1 (reused from Mortuary). `tenant_id` NOT NULL + `REFERENCES tenant(id)
 *     ON DELETE RESTRICT` on every table below — the source had no tenant
 *     concept at all (single-hospital), so this is pure addition, not a
 *     change to an existing constraint.
 *  D2 (reused from Mortuary, same reasoning). `drug_indenting_staff_
 *     profiles.user_login_id` is tenant-scoped-unique here (source: flat
 *     global unique on `users.user_login_id`) — two unrelated hospitals
 *     independently issuing the same login-id scheme is expected once
 *     genuinely multi-tenant.
 *  D3 (NEW — Drug Indenting differs from Mortuary here, verified not
 *     assumed): unlike Mortuary's source schema (zero FKs between its own
 *     domain tables, confirmed in Stage B), Drug Indenting's source DOES
 *     use real FK constraints in several places:
 *       - drug_requests.doctor_id  NOT NULL REFERENCES users(user_id)
 *       - drug_requests.created_by_user_id  REFERENCES users(user_id)
 *       - drug_requests.hod_id  REFERENCES users(user_id)
 *       - drug_alternatives.request_id  REFERENCES drug_requests(request_id) ON DELETE CASCADE
 *       - drug_alternatives.submitted_by  REFERENCES users(user_id)
 *       - drug_alternative_negotiations.alternative_id  REFERENCES drug_alternatives(alt_id) ON DELETE CASCADE
 *       - drug_alternative_negotiations.negotiated_by  REFERENCES users(user_id)
 *       - drug_user_request_quotas.user_id  NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE
 *       - drug_user_request_quotas.updated_by  REFERENCES users(user_id)
 *       - drug_audit_logs.request_id  NOT NULL REFERENCES drug_requests(request_id)  (no CASCADE — a request cannot be deleted while its audit trail exists, a real, preserved compliance guarantee)
 *       - drug_audit_logs.performed_by  NOT NULL REFERENCES users(user_id)
 *     All preserved here, mapped onto ZoeConnect's `users`/sibling tables.
 *     Verified column-by-column which identity-reference columns in
 *     `drug_requests` do NOT have a source FK (`dtc_reviewed_by`,
 *     `reverted_by`, `last_corrected_by`, `inventory_added_by`,
 *     `inventory_received_by`, `final_selected_alternative_id`) —
 *     these remain plain unconstrained `uuid` columns, matching the
 *     source exactly rather than "completing" a pattern the source
 *     itself didn't apply consistently.
 *  D4 (reused from Mortuary). `drug_blacklisted_companies` tenant-scoped
 *     — flagged as a real decision needing confirmation (see the
 *     entity's own doc comment), not silently assumed either way.
 *  D5. Enum-shaped columns intentionally NOT used here — every status/
 *     stage/role field in the source is a free-text VARCHAR with no
 *     CHECK constraint and a large, evolving value set (13 workflow
 *     stages, growing statuses) that the application logic — not the
 *     schema — is the source of truth for. Matches the source's own
 *     choice (no CHECK constraints on `status`/`current_stage` in
 *     001_initial_schema.sql), unlike Mortuary's few genuinely fixed
 *     enums (cabin_type, approval_status).
 */
export class CreateDrugIndentingSchema1794000000000 implements MigrationInterface {
  name = 'CreateDrugIndentingSchema1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── drug_indenting_staff_profiles ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "drug_indenting_staff_profiles" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"               uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "tenant_id"             uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "user_login_id"         varchar(50) NOT NULL,
        "department"            varchar(200),
        "is_approved"           boolean NOT NULL DEFAULT true,
        "force_password_reset"  boolean NOT NULL DEFAULT false,
        "created_at"            timestamptz NOT NULL DEFAULT now(),
        "updated_at"            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_drug_staff_profiles_tenant_login" UNIQUE ("tenant_id", "user_login_id")
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_drug_staff_profiles_tenant" ON "drug_indenting_staff_profiles" ("tenant_id");`);

    // ── drug_requests ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "drug_requests" (
        "id"                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"                      uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "doctor_id"                      uuid NOT NULL REFERENCES "users"("id"),
        "created_by_user_id"             uuid REFERENCES "users"("id"),
        "created_by_role"                varchar(50) DEFAULT 'Doctor',
        "hod_id"                         uuid REFERENCES "users"("id"),
        "med_rep_name"                   varchar(200),
        "med_rep_email"                  varchar(200),
        "med_rep_phone"                  varchar(50),
        "request_type"                   varchar(100) NOT NULL,
        "formulary_request_type"         varchar(50),
        "request_source_type"            varchar(20) DEFAULT 'PROMOTIONAL',
        "category"                       varchar(100) NOT NULL,
        "brand_name"                     varchar(200) NOT NULL,
        "generic_name"                   varchar(200) NOT NULL,
        "dose_strength"                  varchar(100) NOT NULL,
        "dosage_form"                    varchar(100) NOT NULL,
        "manufacturer"                   varchar(200) NOT NULL,
        "marketer"                       varchar(200) NOT NULL,
        "existing_brands"                varchar(500),
        "existing_generic_data"          text,
        "ai_content"                     text,
        "medicine_quantity"              integer,
        "clinical_justification"         text NOT NULL,
        "expected_patients_pm"           integer,
        "cost_reduction_benefit"         boolean DEFAULT false,
        "status"                         varchar(50) NOT NULL DEFAULT 'Pending',
        "current_stage"                  varchar(50) NOT NULL DEFAULT 'PharmacyHead',
        "is_emergency"                   boolean DEFAULT false,
        "is_reverted"                    boolean DEFAULT false,
        "revert_count"                   integer DEFAULT 0,
        "approved_by_hod"                boolean DEFAULT false,
        "hod_remarks"                    varchar(1000),
        "hod_action_timestamp"           timestamp,
        "pharmacist_remarks"             varchar(1000),
        "pharmacist2_remarks"            varchar(1000),
        "ph_review_remarks"              text,
        "ph_remarks"                     varchar(1000),
        "ph_remarks2"                    varchar(1000),
        "ph_review2_remarks"             varchar(2000),
        "ph_final_recommendation"        text,
        "dtc_remarks"                    varchar(1000),
        "dtc_final_remarks"              varchar(1000),
        "dtc_selected_brand"             varchar(500),
        "dtc_selected_category"          varchar(100),
        "dtc_selection_reasons"          text,
        "dtc_recommendation_notes"       text,
        "dtc_reviewed_by"                uuid,
        "dtc_reviewed_at"                timestamp,
        "dtc_reviewed_by_name"           varchar(500),
        "dtc_review_signature"           varchar(1000),
        "dtc_final_selection_notes"      varchar(1000),
        "dtc_final_recommendations"      text,
        "ceo_remarks"                    varchar(1000),
        "final_selected_alternative_id"  uuid,
        "final_selected_brand"           varchar(500),
        "final_selected_category"        varchar(100),
        "final_selection_reasons"        text,
        "final_recommendation_notes"     text,
        "revert_remarks"                 varchar(4000),
        "reverted_by"                    uuid,
        "reverted_at"                    timestamp,
        "last_corrected_at"              timestamp,
        "last_corrected_by"              uuid,
        "inventory_added"                boolean DEFAULT false,
        "inventory_added_at"             timestamp,
        "inventory_added_by"             uuid,
        "inventory_item_name"            varchar(500),
        "inventory_received"             boolean DEFAULT false,
        "inventory_received_at"          timestamp,
        "inventory_received_by"          uuid,
        "created_at"                     timestamptz NOT NULL DEFAULT now(),
        "updated_at"                     timestamp,
        "effective_created_at"           timestamp
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_dreq_tenant" ON "drug_requests" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_dreq_stage" ON "drug_requests" ("current_stage", "status");`);
    await queryRunner.query(`CREATE INDEX "idx_dreq_doctor_created" ON "drug_requests" ("doctor_id", "created_at");`);

    // ── drug_alternatives ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "drug_alternatives" (
        "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"                 uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "request_id"                uuid NOT NULL REFERENCES "drug_requests"("id") ON DELETE CASCADE,
        "brand_name"                varchar(200) NOT NULL,
        "manufacturer"              varchar(200) NOT NULL,
        "marketer"                  varchar(200),
        "consultant"                varchar(300),
        "introduced_on"             varchar(100),
        "consultant_present_stock"  integer,
        "purchase_quantity"         integer,
        "sale_quantity"             integer,
        "sale_qty"                  integer,
        "pack"                      varchar(100),
        "mrp"                       numeric(10,2),
        "rate"                      numeric(10,2),
        "qty"                       numeric(10,2),
        "offer"                     numeric(10,2),
        "negotiated_rate"           numeric(10,2),
        "mrp_per_pack"              numeric(10,2),
        "rate_per_pack"             numeric(10,2),
        "gst_percent"               numeric(5,2),
        "markup_margin"             numeric(10,2),
        "scheme_qty"                integer,
        "scheme_offer"              varchar(200),
        "net_rate"                  numeric(10,2),
        "total_margin"              numeric(10,2),
        "profit_margin"             numeric(10,2),
        "absolute_margin"           numeric(10,2),
        "stock"                     varchar(100),
        "existing_drug_details"     varchar(500),
        "transaction_history"       varchar(500),
        "margin_comparison"         varchar(500),
        "sales_data"                varchar(500),
        "stock_usage"               varchar(500),
        "comparison_type"           varchar(20),
        "is_final_selected"         boolean DEFAULT false,
        "remark"                    varchar(500),
        "refer"                     varchar(500),
        "submitted_by"              uuid REFERENCES "users"("id"),
        "created_at"                timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_dalt_tenant" ON "drug_alternatives" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_dalt_request" ON "drug_alternatives" ("request_id");`);

    // ── drug_alternative_negotiations ──────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "drug_alternative_negotiations" (
        "id"                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"                   uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "alternative_id"              uuid NOT NULL REFERENCES "drug_alternatives"("id") ON DELETE CASCADE,
        "negotiated_mrp"              numeric(10,2),
        "negotiated_rate"             numeric(10,2),
        "negotiated_gst"              numeric(5,2),
        "negotiated_scheme_qty"       integer,
        "negotiated_scheme_offer"     varchar(200),
        "negotiated_net_rate"         numeric(10,2),
        "negotiated_profit_margin"    numeric(10,2),
        "negotiated_absolute_margin"  numeric(10,2),
        "negotiated_total_margin"     numeric(10,2),
        "negotiated_by"               uuid REFERENCES "users"("id"),
        "negotiated_at"               timestamp DEFAULT CURRENT_TIMESTAMP,
        "negotiation_remarks"         varchar(1000)
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_dneg_tenant" ON "drug_alternative_negotiations" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_dneg_alternative" ON "drug_alternative_negotiations" ("alternative_id");`);

    // ── drug_blacklisted_companies (D4 — tenant-scoped, see entity doc) ──
    await queryRunner.query(`
      CREATE TABLE "drug_blacklisted_companies" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"     uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "company_name"  varchar(300) NOT NULL,
        "company_type"  varchar(50) NOT NULL,
        "remarks"       varchar(2000),
        "created_by"    uuid,
        "is_active"     boolean DEFAULT true,
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "removed_by"    uuid,
        "removed_at"    timestamp
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_dblack_tenant" ON "drug_blacklisted_companies" ("tenant_id");`);

    // ── drug_user_request_quotas ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "drug_user_request_quotas" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"        uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "user_id"          uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "quarterly_limit"  integer NOT NULL DEFAULT 10,
        "updated_by"       uuid REFERENCES "users"("id"),
        "updated_at"       timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_dquota_tenant" ON "drug_user_request_quotas" ("tenant_id");`);

    // ── drug_audit_logs (no CASCADE from drug_requests — preserved: a
    //    request cannot be deleted while its audit trail exists) ────────
    await queryRunner.query(`
      CREATE TABLE "drug_audit_logs" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"    uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "request_id"   uuid NOT NULL REFERENCES "drug_requests"("id"),
        "action"       varchar(50) NOT NULL,
        "performed_by" uuid NOT NULL REFERENCES "users"("id"),
        "from_stage"   varchar(50),
        "to_stage"     varchar(50),
        "remarks"      varchar(1000),
        "logged_at"    timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_daudit_tenant" ON "drug_audit_logs" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_daudit_request" ON "drug_audit_logs" ("request_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "drug_audit_logs";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drug_user_request_quotas";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drug_blacklisted_companies";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drug_alternative_negotiations";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drug_alternatives";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drug_requests";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drug_indenting_staff_profiles";`);
  }
}
