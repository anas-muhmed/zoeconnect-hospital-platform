import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Incident Management Module — v1.0 Schema
 *
 * Creates the complete Incident Management database schema:
 *
 * Configuration tables (all admin-configurable, no hardcoding):
 *   incident_categories, incident_types, incident_severity_levels,
 *   incident_priority_levels, incident_risk_matrix_config,
 *   incident_sla_configs, incident_notification_rules
 *
 * Core workflow tables:
 *   incidents (primary entity, hospital-prefixed incident numbers),
 *   incident_timeline_events (immutable audit trail),
 *   incident_attachments (StorageModule-backed file metadata),
 *   incident_triage (Triage/Containment assessment),
 *   incident_investigations (multi-investigator, lead + team),
 *   incident_investigation_statements (witness/staff statements),
 *   incident_rca (Root Cause Analysis),
 *   incident_rca_five_whys (Five Why entries),
 *   incident_rca_fishbone_nodes (Fishbone diagram, JSONB layout),
 *   incident_capa (Corrective & Preventive Actions),
 *   incident_capa_evidence (evidence attached to CAPA),
 *   incident_verification (quality verification outcomes),
 *   incident_closure (closure with residual risk)
 *
 * SLA tracking:
 *   sla_response_due, sla_investigation_due, sla_capa_due, sla_closure_due
 *   on the incidents table + pre/post CAPA residual risk.
 *
 * RBAC: 12 permissions seeded and granted to SUPER_ADMIN / HOSPITAL_ADMIN.
 *
 * Follows the established HDSP pattern from CreateFeedbackModule and
 * CreateEICSchema: tenant_id on every table, gen_random_uuid() as PK default,
 * TIMESTAMPTZ for all timestamps, explicit named constraints.
 */
export class CreateIncidentManagementSchema1787000000000 implements MigrationInterface {
  name = 'CreateIncidentManagementSchema1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Configuration Tables ──────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_categories" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"     UUID,
        "name"          VARCHAR(100) NOT NULL,
        "code"          VARCHAR(50)  NOT NULL,
        "description"   TEXT,
        "is_active"     BOOLEAN NOT NULL DEFAULT TRUE,
        "display_order" INT NOT NULL DEFAULT 0,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_categories" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX "UQ_incident_categories_tenant_code"
        ON "incident_categories" ("tenant_id", "code")
        WHERE "tenant_id" IS NOT NULL;
      CREATE INDEX "IDX_incident_categories_tenant" ON "incident_categories" ("tenant_id", "is_active");
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_types" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"     UUID,
        "category_id"   UUID NOT NULL,
        "name"          VARCHAR(100) NOT NULL,
        "code"          VARCHAR(50)  NOT NULL,
        "description"   TEXT,
        "is_active"     BOOLEAN NOT NULL DEFAULT TRUE,
        "display_order" INT NOT NULL DEFAULT 0,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_types" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_types_category"
          FOREIGN KEY ("category_id") REFERENCES "incident_categories" ("id") ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX "UQ_incident_types_tenant_category_code"
        ON "incident_types" ("tenant_id", "category_id", "code")
        WHERE "tenant_id" IS NOT NULL;
      CREATE INDEX "IDX_incident_types_category" ON "incident_types" ("category_id", "is_active");
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_severity_levels" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"     UUID,
        "name"          VARCHAR(50) NOT NULL,
        "code"          VARCHAR(20) NOT NULL,
        "color"         VARCHAR(20) NOT NULL DEFAULT '#6B7280',
        "sla_response_hours"     INT,
        "sla_investigation_hours" INT,
        "sla_capa_days"          INT,
        "sla_closure_days"       INT,
        "notify_roles"  JSONB NOT NULL DEFAULT '[]',
        "display_order" INT NOT NULL DEFAULT 0,
        "is_active"     BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_severity_levels" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX "UQ_incident_severity_tenant_code"
        ON "incident_severity_levels" ("tenant_id", "code")
        WHERE "tenant_id" IS NOT NULL;
      CREATE INDEX "IDX_incident_severity_tenant" ON "incident_severity_levels" ("tenant_id", "is_active");
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_priority_levels" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"     UUID,
        "name"          VARCHAR(50) NOT NULL,
        "code"          VARCHAR(20) NOT NULL,
        "color"         VARCHAR(20) NOT NULL DEFAULT '#6B7280',
        "display_order" INT NOT NULL DEFAULT 0,
        "is_active"     BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_priority_levels" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_incident_priority_tenant" ON "incident_priority_levels" ("tenant_id", "is_active");
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_risk_matrix_config" (
        "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"    UUID,
        "likelihood"   SMALLINT NOT NULL CHECK ("likelihood" BETWEEN 1 AND 5),
        "impact"       SMALLINT NOT NULL CHECK ("impact" BETWEEN 1 AND 5),
        "risk_score"   SMALLINT NOT NULL GENERATED ALWAYS AS ("likelihood" * "impact") STORED,
        "risk_level"   VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        "color"        VARCHAR(20) NOT NULL DEFAULT '#F59E0B',
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_risk_matrix_config" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_incident_risk_matrix_cell"
          UNIQUE ("tenant_id", "likelihood", "impact")
      );
      CREATE INDEX "IDX_incident_risk_matrix_tenant"
        ON "incident_risk_matrix_config" ("tenant_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_notification_rules" (
        "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"      UUID,
        "name"           VARCHAR(200) NOT NULL,
        "description"    TEXT,
        "trigger_event"  VARCHAR(50) NOT NULL,
        "conditions"     JSONB NOT NULL DEFAULT '[]',
        "notify_roles"   JSONB NOT NULL DEFAULT '[]',
        "notify_user_ids" JSONB NOT NULL DEFAULT '[]',
        "channel"        VARCHAR(20) NOT NULL DEFAULT 'PUSH',
        "is_active"      BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_notification_rules" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_incident_notif_rules_tenant"
        ON "incident_notification_rules" ("tenant_id", "is_active", "trigger_event");
    `);

    // ── 2. Primary Incident Table ────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incidents" (
        "id"                      UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"               UUID,
        "incident_number"         VARCHAR(50) NOT NULL,
        "status"                  VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        "category_id"             UUID NOT NULL,
        "type_id"                 UUID,
        "severity_code"           VARCHAR(20) NOT NULL DEFAULT 'LOW',
        "priority_code"           VARCHAR(20) NOT NULL DEFAULT 'ROUTINE',
        "risk_score"              SMALLINT,
        "risk_level"              VARCHAR(20),
        "residual_risk_score_pre_capa"  SMALLINT,
        "residual_risk_level_pre_capa"  VARCHAR(20),
        "residual_risk_score_post_capa" SMALLINT,
        "residual_risk_level_post_capa" VARCHAR(20),
        "incident_date"           TIMESTAMPTZ NOT NULL,
        "reported_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "department"              VARCHAR(100) NOT NULL,
        "ward"                    VARCHAR(100),
        "location"                VARCHAR(255),
        "reporter_id"             UUID NOT NULL,
        "lead_investigator_id"    UUID,
        "patient_mrn"             VARCHAR(50),
        "patient_snapshot"        JSONB,
        "employee_id"             VARCHAR(100),
        "description"             TEXT NOT NULL,
        "immediate_action"        TEXT,
        "current_stage"           VARCHAR(30) NOT NULL DEFAULT 'REPORTING',
        "is_anonymous"            BOOLEAN NOT NULL DEFAULT FALSE,
        "is_near_miss"            BOOLEAN NOT NULL DEFAULT FALSE,
        "is_sentinel_event"       BOOLEAN NOT NULL DEFAULT FALSE,
        "tags"                    JSONB NOT NULL DEFAULT '[]',
        "sla_response_due"        TIMESTAMPTZ,
        "sla_investigation_due"   TIMESTAMPTZ,
        "sla_capa_due"            TIMESTAMPTZ,
        "sla_closure_due"         TIMESTAMPTZ,
        "sla_response_breached"   BOOLEAN NOT NULL DEFAULT FALSE,
        "sla_investigation_breached" BOOLEAN NOT NULL DEFAULT FALSE,
        "sla_capa_breached"       BOOLEAN NOT NULL DEFAULT FALSE,
        "sla_closure_breached"    BOOLEAN NOT NULL DEFAULT FALSE,
        "created_by_id"           UUID NOT NULL,
        "updated_by_id"           UUID,
        "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incidents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incidents_category"
          FOREIGN KEY ("category_id") REFERENCES "incident_categories" ("id")
      );

      CREATE UNIQUE INDEX "UQ_incidents_tenant_number"
        ON "incidents" ("tenant_id", "incident_number")
        WHERE "tenant_id" IS NOT NULL;
      CREATE INDEX "IDX_incidents_tenant_status"
        ON "incidents" ("tenant_id", "status");
      CREATE INDEX "IDX_incidents_tenant_severity"
        ON "incidents" ("tenant_id", "severity_code");
      CREATE INDEX "IDX_incidents_tenant_category"
        ON "incidents" ("tenant_id", "category_id");
      CREATE INDEX "IDX_incidents_tenant_department"
        ON "incidents" ("tenant_id", "department");
      CREATE INDEX "IDX_incidents_patient_mrn"
        ON "incidents" ("tenant_id", "patient_mrn")
        WHERE "patient_mrn" IS NOT NULL;
      CREATE INDEX "IDX_incidents_tenant_created"
        ON "incidents" ("tenant_id", "created_at" DESC);
      CREATE INDEX "IDX_incidents_investigator"
        ON "incidents" ("tenant_id", "lead_investigator_id")
        WHERE "lead_investigator_id" IS NOT NULL;
      CREATE INDEX "IDX_incidents_incident_date"
        ON "incidents" ("tenant_id", "incident_date" DESC);
      CREATE INDEX "IDX_incidents_sentinel"
        ON "incidents" ("tenant_id", "is_sentinel_event")
        WHERE "is_sentinel_event" = TRUE;
      CREATE INDEX "IDX_incidents_near_miss"
        ON "incidents" ("tenant_id", "is_near_miss")
        WHERE "is_near_miss" = TRUE;
    `);

    // ── 3. Timeline Events (immutable) ───────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_timeline_events" (
        "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"    UUID,
        "incident_id"  UUID NOT NULL,
        "event_type"   VARCHAR(50) NOT NULL,
        "actor_id"     UUID,
        "actor_name"   VARCHAR(255),
        "description"  TEXT NOT NULL,
        "metadata"     JSONB,
        "occurred_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_incident_timeline_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_timeline_incident"
          FOREIGN KEY ("incident_id") REFERENCES "incidents" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_timeline_incident"
        ON "incident_timeline_events" ("incident_id", "occurred_at" DESC);
      CREATE INDEX "IDX_incident_timeline_tenant"
        ON "incident_timeline_events" ("tenant_id", "occurred_at" DESC);
    `);

    // ── 4. Attachments ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_attachments" (
        "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"       UUID,
        "incident_id"     UUID NOT NULL,
        "parent_type"     VARCHAR(30) NOT NULL DEFAULT 'INCIDENT',
        "parent_id"       UUID NOT NULL,
        "storage_key"     VARCHAR(1000) NOT NULL,
        "thumbnail_key"   VARCHAR(1000),
        "original_name"   VARCHAR(500) NOT NULL,
        "mime_type"       VARCHAR(100) NOT NULL,
        "size_bytes"      BIGINT NOT NULL DEFAULT 0,
        "attachment_type" VARCHAR(20) NOT NULL DEFAULT 'document',
        "uploaded_by_id"  UUID NOT NULL,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_incident_attachments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_attachments_incident"
          FOREIGN KEY ("incident_id") REFERENCES "incidents" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_attachments_incident"
        ON "incident_attachments" ("incident_id");
      CREATE INDEX "IDX_incident_attachments_parent"
        ON "incident_attachments" ("parent_type", "parent_id");
    `);

    // ── 5. Comments ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_comments" (
        "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"       UUID,
        "incident_id"     UUID NOT NULL,
        "author_id"       UUID NOT NULL,
        "author_name"     VARCHAR(255) NOT NULL,
        "content"         TEXT NOT NULL,
        "visibility"      VARCHAR(20) NOT NULL DEFAULT 'INTERNAL',
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        "deleted_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_incident_comments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_comments_incident"
          FOREIGN KEY ("incident_id") REFERENCES "incidents" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_comments_incident_date"
        ON "incident_comments" ("incident_id", "created_at");
    `);

    // ── 6. Triage ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_triage" (
        "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"            UUID,
        "incident_id"          UUID NOT NULL,
        "triaged_by_id"        UUID NOT NULL,
        "assigned_to_id"       UUID,
        "priority_code"        VARCHAR(20) NOT NULL DEFAULT 'ROUTINE',
        "response_sla_hours"   INT,
        "escalation_required"  BOOLEAN NOT NULL DEFAULT FALSE,
        "escalation_roles"     JSONB NOT NULL DEFAULT '[]',
        "containment_required" BOOLEAN NOT NULL DEFAULT FALSE,
        "containment_notes"    TEXT,
        "triage_notes"         TEXT,
        "triaged_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_triage" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_incident_triage_incident" UNIQUE ("incident_id"),
        CONSTRAINT "FK_incident_triage_incident"
          FOREIGN KEY ("incident_id") REFERENCES "incidents" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_triage_tenant"
        ON "incident_triage" ("tenant_id");
    `);

    // ── 6. Investigations ────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_investigations" (
        "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"       UUID,
        "incident_id"     UUID NOT NULL,
        "title"           VARCHAR(300) NOT NULL,
        "lead_id"         UUID NOT NULL,
        "team_member_ids" JSONB NOT NULL DEFAULT '[]',
        "status"          VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        "timeline_notes"  TEXT,
        "findings"        TEXT,
        "recommendations" TEXT,
        "started_at"      TIMESTAMPTZ,
        "completed_at"    TIMESTAMPTZ,
        "created_by_id"   UUID NOT NULL,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_investigations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_investigations_incident"
          FOREIGN KEY ("incident_id") REFERENCES "incidents" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_investigations_incident"
        ON "incident_investigations" ("incident_id", "status");
      CREATE INDEX "IDX_incident_investigations_lead"
        ON "incident_investigations" ("tenant_id", "lead_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_investigation_statements" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        UUID,
        "investigation_id" UUID NOT NULL,
        "statement_type"   VARCHAR(20) NOT NULL DEFAULT 'WITNESS',
        "person_name"      VARCHAR(255) NOT NULL,
        "person_role"      VARCHAR(100),
        "department"       VARCHAR(100),
        "statement_text"   TEXT NOT NULL,
        "statement_date"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "recorded_by_id"   UUID NOT NULL,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_incident_investigation_statements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_statements_investigation"
          FOREIGN KEY ("investigation_id") REFERENCES "incident_investigations" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_statements_investigation"
        ON "incident_investigation_statements" ("investigation_id");
    `);

    // ── 7. Root Cause Analysis ───────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_rca" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        UUID,
        "incident_id"      UUID NOT NULL,
        "investigation_id" UUID,
        "method"           VARCHAR(20) NOT NULL DEFAULT 'FIVE_WHY',
        "summary"          TEXT,
        "root_cause"       TEXT,
        "status"           VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
        "conducted_by_id"  UUID NOT NULL,
        "completed_at"     TIMESTAMPTZ,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_rca" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_rca_incident"
          FOREIGN KEY ("incident_id") REFERENCES "incidents" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_rca_incident"
        ON "incident_rca" ("incident_id", "status");
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_rca_five_whys" (
        "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"  UUID,
        "rca_id"     UUID NOT NULL,
        "why_number" SMALLINT NOT NULL CHECK ("why_number" BETWEEN 1 AND 5),
        "why_text"   TEXT NOT NULL,
        "because"    TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_incident_rca_five_whys" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rca_five_whys_rca_number" UNIQUE ("rca_id", "why_number"),
        CONSTRAINT "FK_incident_rca_five_whys_rca"
          FOREIGN KEY ("rca_id") REFERENCES "incident_rca" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_rca_five_whys_rca"
        ON "incident_rca_five_whys" ("rca_id", "why_number");
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_rca_fishbone_nodes" (
        "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"  UUID,
        "rca_id"     UUID NOT NULL,
        "category"   VARCHAR(30) NOT NULL,
        "cause_text" TEXT NOT NULL,
        "parent_id"  UUID,
        "layout"     JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_incident_rca_fishbone_nodes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_fishbone_rca"
          FOREIGN KEY ("rca_id") REFERENCES "incident_rca" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_fishbone_rca"
        ON "incident_rca_fishbone_nodes" ("rca_id", "category");
    `);

    // ── 8. CAPA ──────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_capa" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        UUID,
        "incident_id"      UUID NOT NULL,
        "rca_id"           UUID,
        "title"            VARCHAR(300) NOT NULL,
        "description"      TEXT NOT NULL,
        "capa_type"        VARCHAR(20) NOT NULL DEFAULT 'CORRECTIVE',
        "owner_id"         UUID NOT NULL,
        "owner_name"       VARCHAR(255),
        "department"       VARCHAR(100),
        "due_date"         DATE NOT NULL,
        "priority_code"    VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        "status"           VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "completion_notes" TEXT,
        "completed_at"     TIMESTAMPTZ,
        "is_overdue"       BOOLEAN NOT NULL DEFAULT FALSE,
        "created_by_id"    UUID NOT NULL,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "version"                 INT NOT NULL DEFAULT 1,
        CONSTRAINT "PK_incident_capa" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_capa_incident"
          FOREIGN KEY ("incident_id") REFERENCES "incidents" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_capa_incident"
        ON "incident_capa" ("incident_id", "status");
      CREATE INDEX "IDX_incident_capa_owner"
        ON "incident_capa" ("tenant_id", "owner_id", "status");
      CREATE INDEX "IDX_incident_capa_due"
        ON "incident_capa" ("tenant_id", "due_date", "status")
        WHERE "status" NOT IN ('COMPLETED', 'REJECTED');
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_capa_evidence" (
        "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"   UUID,
        "capa_id"     UUID NOT NULL,
        "storage_key" VARCHAR(1000) NOT NULL,
        "file_name"   VARCHAR(500) NOT NULL,
        "mime_type"   VARCHAR(100) NOT NULL,
        "size_bytes"  BIGINT NOT NULL DEFAULT 0,
        "uploaded_by_id" UUID NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_incident_capa_evidence" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_capa_evidence_capa"
          FOREIGN KEY ("capa_id") REFERENCES "incident_capa" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_capa_evidence_capa"
        ON "incident_capa_evidence" ("capa_id");
    `);

    // ── 9. Verification ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_verification" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"     UUID,
        "capa_id"       UUID NOT NULL,
        "incident_id"   UUID NOT NULL,
        "outcome"       VARCHAR(30) NOT NULL,
        "verified_by_id" UUID NOT NULL,
        "notes"         TEXT,
        "verified_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_incident_verification" PRIMARY KEY ("id"),
        CONSTRAINT "FK_incident_verification_capa"
          FOREIGN KEY ("capa_id") REFERENCES "incident_capa" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_incident_verification_incident"
          FOREIGN KEY ("incident_id") REFERENCES "incidents" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_verification_capa"
        ON "incident_verification" ("capa_id", "verified_at" DESC);
      CREATE INDEX "IDX_incident_verification_incident"
        ON "incident_verification" ("incident_id");
    `);

    // ── 10. Closure ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "incident_closure" (
        "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"              UUID,
        "incident_id"            UUID NOT NULL,
        "closure_notes"          TEXT NOT NULL,
        "lessons_learned"        TEXT,
        "final_risk_score"       SMALLINT,
        "final_risk_level"       VARCHAR(20),
        "residual_risk_accepted" BOOLEAN NOT NULL DEFAULT FALSE,
        "residual_risk_notes"    TEXT,
        "closed_by_id"           UUID NOT NULL,
        "approved_by_id"         UUID,
        "closed_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_incident_closure" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_incident_closure_incident" UNIQUE ("incident_id"),
        CONSTRAINT "FK_incident_closure_incident"
          FOREIGN KEY ("incident_id") REFERENCES "incidents" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incident_closure_tenant"
        ON "incident_closure" ("tenant_id", "closed_at" DESC);
    `);

    // ── 11. Seed default incident categories ─────────────────────────────────

    await queryRunner.query(`
      INSERT INTO "incident_categories" ("name", "code", "display_order") VALUES
        ('Patient Safety',        'PATIENT_SAFETY',        1),
        ('Medication',            'MEDICATION',            2),
        ('Clinical',              'CLINICAL',              3),
        ('Laboratory',            'LABORATORY',            4),
        ('Radiology',             'RADIOLOGY',             5),
        ('Pharmacy',              'PHARMACY',              6),
        ('Blood Bank',            'BLOOD_BANK',            7),
        ('Biomedical Equipment',  'BIOMEDICAL',            8),
        ('Facility',              'FACILITY',              9),
        ('Housekeeping',          'HOUSEKEEPING',          10),
        ('Security',              'SECURITY',              11),
        ('Fire',                  'FIRE',                  12),
        ('Infection Control',     'INFECTION_CONTROL',     13),
        ('IT',                    'IT',                    14),
        ('Data Privacy',          'DATA_PRIVACY',          15),
        ('HR',                    'HR',                    16),
        ('Finance',               'FINANCE',               17),
        ('Near Miss',             'NEAR_MISS',             18),
        ('Sentinel Event',        'SENTINEL_EVENT',        19),
        ('Visitor Incident',      'VISITOR_INCIDENT',      20),
        ('Employee Injury',       'EMPLOYEE_INJURY',       21)
      ON CONFLICT DO NOTHING;
    `);

    // Seed some default types for common categories
    await queryRunner.query(`
      INSERT INTO "incident_types" ("category_id", "name", "code", "display_order")
      SELECT c.id, t.name, t.code, t.ord
      FROM "incident_categories" c
      JOIN (VALUES
        ('MEDICATION', 'Wrong Drug',           'WRONG_DRUG',           1),
        ('MEDICATION', 'Wrong Dose',           'WRONG_DOSE',           2),
        ('MEDICATION', 'Missed Dose',          'MISSED_DOSE',          3),
        ('MEDICATION', 'Duplicate Dose',       'DUPLICATE_DOSE',       4),
        ('MEDICATION', 'Late Administration',  'LATE_ADMIN',           5),
        ('PATIENT_SAFETY', 'Fall',             'FALL',                 1),
        ('PATIENT_SAFETY', 'Pressure Injury',  'PRESSURE_INJURY',      2),
        ('PATIENT_SAFETY', 'Elopement',        'ELOPEMENT',            3),
        ('PATIENT_SAFETY', 'Suicide Attempt',  'SUICIDE_ATTEMPT',      4),
        ('BIOMEDICAL', 'Equipment Failure',    'EQUIP_FAILURE',        1),
        ('BIOMEDICAL', 'Calibration Failure',  'CALIBRATION_FAILURE',  2),
        ('BIOMEDICAL', 'Device Malfunction',   'DEVICE_MALFUNCTION',   3)
      ) AS t(cat_code, name, code, ord) ON c.code = t.cat_code
      WHERE c.tenant_id IS NULL
      ON CONFLICT DO NOTHING;
    `);

    // Seed default severity levels
    await queryRunner.query(`
      INSERT INTO "incident_severity_levels"
        ("name", "code", "color", "sla_response_hours", "sla_investigation_hours", "sla_capa_days", "sla_closure_days", "display_order")
      VALUES
        ('Low',      'LOW',      '#10B981', 240,  168, 30, 90, 1),
        ('Moderate', 'MODERATE', '#F59E0B',  48,   72, 14, 60, 2),
        ('High',     'HIGH',     '#EF4444',  24,   48,  7, 30, 3),
        ('Critical', 'CRITICAL', '#7C3AED',   1,   24,  3, 14, 4)
      ON CONFLICT DO NOTHING;
    `);

    // Seed default priority levels
    await queryRunner.query(`
      INSERT INTO "incident_priority_levels" ("name", "code", "color", "display_order")
      VALUES
        ('Routine',  'ROUTINE',  '#6B7280', 1),
        ('Urgent',   'URGENT',   '#F59E0B', 2),
        ('Emergency','EMERGENCY','#EF4444', 3)
      ON CONFLICT DO NOTHING;
    `);

    // Seed default risk matrix (5×5)
    await queryRunner.query(`
      INSERT INTO "incident_risk_matrix_config" ("likelihood", "impact", "risk_level", "color")
      SELECT l, i,
        CASE
          WHEN (l * i) <= 4  THEN 'LOW'
          WHEN (l * i) <= 9  THEN 'MEDIUM'
          WHEN (l * i) <= 16 THEN 'HIGH'
          ELSE 'CRITICAL'
        END,
        CASE
          WHEN (l * i) <= 4  THEN '#10B981'
          WHEN (l * i) <= 9  THEN '#F59E0B'
          WHEN (l * i) <= 16 THEN '#EF4444'
          ELSE '#7C3AED'
        END
      FROM generate_series(1,5) AS l, generate_series(1,5) AS i
      ON CONFLICT DO NOTHING;
    `);

    // ── 12. RBAC Permissions ─────────────────────────────────────────────────

    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code", "resource", "action", "description", "tenant_id")
      VALUES
        ('INCIDENT', 'INCIDENTS',     'CREATE',    'Report a new incident',                            NULL),
        ('INCIDENT', 'INCIDENTS',     'READ',      'View incident details',                            NULL),
        ('INCIDENT', 'INCIDENTS',     'UPDATE',    'Edit incident fields',                             NULL),
        ('INCIDENT', 'INCIDENTS',     'DELETE',    'Delete a draft incident',                          NULL),
        ('INCIDENT', 'INCIDENTS',     'ASSIGN',    'Assign investigator to incident',                  NULL),
        ('INCIDENT', 'INVESTIGATIONS','MANAGE',    'Create/update investigations and statements',      NULL),
        ('INCIDENT', 'RCA',           'MANAGE',    'Create and update root cause analysis',            NULL),
        ('INCIDENT', 'CAPA',          'MANAGE',    'Create and update corrective actions',             NULL),
        ('INCIDENT', 'CAPA',          'VERIFY',    'Verify or reject completed CAPAs',                 NULL),
        ('INCIDENT', 'INCIDENTS',     'CLOSE',     'Close and archive incidents',                      NULL),
        ('INCIDENT', 'DASHBOARD',     'READ',      'View incident dashboards and analytics',           NULL),
        ('INCIDENT', 'SETTINGS',      'MANAGE',    'Configure categories, severity, rules, risk matrix', NULL)
      ON CONFLICT ("module_code", "resource", "action") DO NOTHING;
    `);

    // Grant all incident permissions to SUPER_ADMIN and HOSPITAL_ADMIN
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name IN ('SUPER_ADMIN', 'HOSPITAL_ADMIN')
        AND p.module_code = 'INCIDENT'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove permissions
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT id FROM "permissions" WHERE "module_code" = 'INCIDENT'
      );
    `);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "module_code" = 'INCIDENT';`);

    // Drop tables in reverse dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_closure" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_verification" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_capa_evidence" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_capa" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_rca_fishbone_nodes" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_rca_five_whys" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_rca" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_investigation_statements" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_investigations" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_triage" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_comments" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_attachments" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_timeline_events" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incidents" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_notification_rules" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_risk_matrix_config" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_priority_levels" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_severity_levels" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_types" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_categories" CASCADE;`);
  }
}
