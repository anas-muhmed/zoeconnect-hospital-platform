import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CreateEICSchema — Migration 1700000011000
 *
 * Creates all tables for the Early Intervention Centre (EIC) module:
 *  - eic_patients                     Patient demographics (mirrored from HIS)
 *  - eic_developmental_histories      Pre/natal/postnatal/milestone history
 *  - eic_therapy_enrollments          Admission record per patient
 *  - eic_therapy_team_members         Therapist-to-discipline assignments
 *  - eic_assessments                  Discipline-specific assessments (BT/SLP/DT/OT/SE)
 *  - eic_assessment_tool_scores       Formal assessment tool scores
 *  - eic_goals                        Short-term & long-term therapy goals
 *  - eic_therapy_sessions             Session report headers
 *  - eic_session_entries              Goal–activity–response rows per session
 *  - eic_progress_reports             Quarterly progress reports
 *  - eic_discipline_progress_sections Per-discipline section of a progress report
 *  - eic_discharge_summaries          Discharge records
 *  - eic_discharge_sections           Per-discipline section of a discharge summary
 *  - eic_preschool_enrollments        Preschool-specific enrollment
 *  - eic_preschool_assessments        Preschool intake assessment
 *  - eic_preschool_daily_reports      Daily attendance & activity reports (preschool)
 */
export class CreateEICSchema1700000011000 implements MigrationInterface {
  name = 'CreateEICSchema1700000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. eic_patients ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "eic_patients" (
        "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
        "mrn"                  VARCHAR(50)   NOT NULL,
        "salutation"           VARCHAR(20)   NULL,
        "first_name"           VARCHAR(100)  NOT NULL,
        "middle_name"          VARCHAR(100)  NULL,
        "last_name"            VARCHAR(100)  NOT NULL,
        "full_name"            VARCHAR(300)  NOT NULL,
        "gender"               VARCHAR(20)   NULL,
        "date_of_birth"        DATE          NULL,
        "age_years"            SMALLINT      NULL,
        "age_months"           SMALLINT      NULL,
        "blood_group"          VARCHAR(10)   NULL,
        "mobile"               VARCHAR(20)   NULL,
        "email"                VARCHAR(150)  NULL,
        "address"              TEXT          NULL,
        "city"                 VARCHAR(100)  NULL,
        "state"                VARCHAR(100)  NULL,
        "pin_code"             VARCHAR(10)   NULL,
        "father_name"          VARCHAR(200)  NULL,
        "mother_name"          VARCHAR(200)  NULL,
        "parent_contact"       VARCHAR(20)   NULL,
        "parent_email"         VARCHAR(150)  NULL,
        "referring_doctor_code" VARCHAR(50)  NULL,
        "referring_doctor_name" VARCHAR(200) NULL,
        "his_synced_at"        TIMESTAMPTZ   NULL,
        "is_active"            BOOLEAN       NOT NULL DEFAULT TRUE,
        "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_patients" PRIMARY KEY ("id"),
        CONSTRAINT "uq_eic_patients_mrn" UNIQUE ("mrn")
      )
    `);

    // ── 2. eic_developmental_histories ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "eic_developmental_histories" (
        "id"                     UUID     NOT NULL DEFAULT gen_random_uuid(),
        "patient_id"             UUID     NOT NULL,
        -- Prenatal
        "pregnancy_type"         VARCHAR(50)   NULL,
        "antenatal_complications" JSONB        NULL DEFAULT '[]',
        "maternal_age_at_birth"  SMALLINT      NULL,
        -- Natal
        "delivery_type"          VARCHAR(50)   NULL,
        "gestational_age_weeks"  SMALLINT      NULL,
        "birth_weight_kg"        NUMERIC(4,2)  NULL,
        "birth_cry"              BOOLEAN       NULL,
        "nicu_stay"              BOOLEAN       NULL,
        "nicu_duration_days"     SMALLINT      NULL,
        "birth_complications"    JSONB         NULL DEFAULT '[]',
        -- Postnatal
        "postnatal_jaundice"     BOOLEAN       NULL,
        "postnatal_seizures"     BOOLEAN       NULL,
        "postnatal_other"        TEXT          NULL,
        -- Developmental milestones (ages in months)
        "neck_holding_months"    SMALLINT      NULL,
        "sitting_months"         SMALLINT      NULL,
        "standing_months"        SMALLINT      NULL,
        "walking_months"         SMALLINT      NULL,
        "first_words_months"     SMALLINT      NULL,
        "phrases_months"         SMALLINT      NULL,
        "sentences_months"       SMALLINT      NULL,
        -- Medical history
        "diagnosis"              TEXT          NULL,
        "co_morbidities"         JSONB         NULL DEFAULT '[]',
        "current_medications"    TEXT          NULL,
        "previous_therapy"       TEXT          NULL,
        "family_history"         TEXT          NULL,
        "remarks"                TEXT          NULL,
        "recorded_by"            UUID          NULL,
        "created_at"             TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_dev_histories" PRIMARY KEY ("id"),
        CONSTRAINT "uq_eic_dev_history_patient" UNIQUE ("patient_id"),
        CONSTRAINT "fk_eic_dev_history_patient"
          FOREIGN KEY ("patient_id") REFERENCES "eic_patients"("id") ON DELETE CASCADE
      )
    `);

    // ── 3. eic_therapy_enrollments ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "eic_enrollment_status" AS ENUM (
        'INITIATED', 'ACTIVE', 'ON_HOLD', 'DISCHARGED', 'CLOSED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "eic_therapy_enrollments" (
        "id"                    UUID                     NOT NULL DEFAULT gen_random_uuid(),
        "patient_id"            UUID                     NOT NULL,
        "enrollment_number"     VARCHAR(30)              NOT NULL,
        "status"                "eic_enrollment_status"  NOT NULL DEFAULT 'INITIATED',
        "admission_date"        DATE                     NOT NULL,
        "discharge_date"        DATE                     NULL,
        "active_disciplines"    JSONB                    NOT NULL DEFAULT '[]',
        "primary_diagnosis"     TEXT                     NULL,
        "referral_source"       VARCHAR(200)             NULL,
        "centre_head_id"        UUID                     NULL,
        "notes"                 TEXT                     NULL,
        "created_by"            UUID                     NULL,
        "updated_by"            UUID                     NULL,
        "created_at"            TIMESTAMPTZ              NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ              NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_enrollments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_eic_enrollment_number" UNIQUE ("enrollment_number"),
        CONSTRAINT "fk_eic_enrollment_patient"
          FOREIGN KEY ("patient_id") REFERENCES "eic_patients"("id") ON DELETE RESTRICT
      )
    `);

    // ── 4. eic_therapy_team_members ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "eic_therapy_team_members" (
        "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "enrollment_id"   UUID          NOT NULL,
        "therapist_id"    UUID          NOT NULL,
        "therapist_name"  VARCHAR(200)  NOT NULL,
        "discipline"      VARCHAR(20)   NOT NULL,
        "assigned_at"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "removed_at"      TIMESTAMPTZ   NULL,
        "is_active"       BOOLEAN       NOT NULL DEFAULT TRUE,
        CONSTRAINT "pk_eic_team_members" PRIMARY KEY ("id"),
        CONSTRAINT "fk_eic_team_enrollment"
          FOREIGN KEY ("enrollment_id") REFERENCES "eic_therapy_enrollments"("id") ON DELETE CASCADE
      )
    `);

    // ── 5. eic_assessments ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "eic_assessment_status" AS ENUM (
        'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'FINALISED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "eic_discipline" AS ENUM (
        'BT', 'SLP', 'DT', 'OT', 'SE', 'PRESCHOOL'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "eic_assessments" (
        "id"                    UUID                      NOT NULL DEFAULT gen_random_uuid(),
        "enrollment_id"         UUID                      NOT NULL,
        "discipline"            "eic_discipline"          NOT NULL,
        "assessment_type"       VARCHAR(30)               NOT NULL DEFAULT 'INITIAL',
        "status"                "eic_assessment_status"   NOT NULL DEFAULT 'DRAFT',
        -- Assessor
        "therapist_id"          UUID                      NOT NULL,
        "therapist_name"        VARCHAR(200)              NOT NULL,
        -- Centre Head countersign
        "countersigned_by"      UUID                      NULL,
        "countersigned_at"      TIMESTAMPTZ               NULL,
        "countersign_notes"     TEXT                      NULL,
        -- Linked to a previous assessment (for re-assessments)
        "parent_assessment_id"  UUID                      NULL,
        -- Clinical data — discipline-specific JSONB blobs
        "socio_demographic"     JSONB                     NULL DEFAULT '{}',
        "background_history"    JSONB                     NULL DEFAULT '{}',
        "clinical_observations" JSONB                     NULL DEFAULT '{}',
        "formal_evaluations"    JSONB                     NULL DEFAULT '{}',
        "assessment_tool_scores" JSONB                   NULL DEFAULT '[]',
        "recommendations"       TEXT                      NULL,
        "goals_section"         JSONB                     NULL DEFAULT '{}',
        "additional_notes"      TEXT                      NULL,
        "submitted_at"          TIMESTAMPTZ               NULL,
        "finalised_at"          TIMESTAMPTZ               NULL,
        "created_at"            TIMESTAMPTZ               NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ               NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_assessments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_eic_assessment_enrollment"
          FOREIGN KEY ("enrollment_id") REFERENCES "eic_therapy_enrollments"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_eic_assessment_parent"
          FOREIGN KEY ("parent_assessment_id") REFERENCES "eic_assessments"("id") ON DELETE SET NULL
      )
    `);

    // ── 6. eic_goals ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "eic_goal_type" AS ENUM ('SHORT_TERM', 'LONG_TERM')
    `);

    await queryRunner.query(`
      CREATE TYPE "eic_goal_status" AS ENUM (
        'ACTIVE', 'ACHIEVED', 'DISCONTINUED', 'CARRIED_FORWARD'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "eic_goals" (
        "id"                UUID                NOT NULL DEFAULT gen_random_uuid(),
        "assessment_id"     UUID                NOT NULL,
        "enrollment_id"     UUID                NOT NULL,
        "discipline"        "eic_discipline"    NOT NULL,
        "goal_type"         "eic_goal_type"     NOT NULL DEFAULT 'SHORT_TERM',
        "goal_text"         TEXT                NOT NULL,
        "target_date"       DATE                NULL,
        "status"            "eic_goal_status"   NOT NULL DEFAULT 'ACTIVE',
        "achieved_at"       TIMESTAMPTZ         NULL,
        "achievement_notes" TEXT                NULL,
        "session_count"     INTEGER             NOT NULL DEFAULT 0,
        "display_order"     SMALLINT            NOT NULL DEFAULT 0,
        "created_by"        UUID                NULL,
        "created_at"        TIMESTAMPTZ         NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ         NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_goals" PRIMARY KEY ("id"),
        CONSTRAINT "fk_eic_goal_assessment"
          FOREIGN KEY ("assessment_id") REFERENCES "eic_assessments"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_eic_goal_enrollment"
          FOREIGN KEY ("enrollment_id") REFERENCES "eic_therapy_enrollments"("id") ON DELETE CASCADE
      )
    `);

    // ── 7. eic_therapy_sessions ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "eic_session_status" AS ENUM ('DRAFT', 'SUBMITTED', 'CANCELLED')
    `);

    await queryRunner.query(`
      CREATE TABLE "eic_therapy_sessions" (
        "id"              UUID                    NOT NULL DEFAULT gen_random_uuid(),
        "enrollment_id"   UUID                    NOT NULL,
        "discipline"      "eic_discipline"        NOT NULL,
        "session_date"    DATE                    NOT NULL,
        "session_number"  INTEGER                 NULL,
        "therapist_id"    UUID                    NOT NULL,
        "therapist_name"  VARCHAR(200)            NOT NULL,
        "duration_minutes" SMALLINT              NULL,
        "attendance"      VARCHAR(20)             NOT NULL DEFAULT 'PRESENT',
        "session_remarks" TEXT                    NULL,
        "status"          "eic_session_status"    NOT NULL DEFAULT 'DRAFT',
        "submitted_at"    TIMESTAMPTZ             NULL,
        "created_at"      TIMESTAMPTZ             NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ             NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_eic_session_enrollment"
          FOREIGN KEY ("enrollment_id") REFERENCES "eic_therapy_enrollments"("id") ON DELETE RESTRICT
      )
    `);

    // ── 8. eic_session_entries ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "eic_session_entries" (
        "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "session_id"      UUID          NOT NULL,
        "goal_id"         UUID          NULL,
        "goal_text"       TEXT          NOT NULL,
        "activity"        TEXT          NOT NULL,
        "child_response"  TEXT          NOT NULL,
        "remarks"         TEXT          NULL,
        "display_order"   SMALLINT      NOT NULL DEFAULT 0,
        "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_session_entries" PRIMARY KEY ("id"),
        CONSTRAINT "fk_eic_session_entry_session"
          FOREIGN KEY ("session_id") REFERENCES "eic_therapy_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_eic_session_entry_goal"
          FOREIGN KEY ("goal_id") REFERENCES "eic_goals"("id") ON DELETE SET NULL
      )
    `);

    // ── 9. eic_progress_reports ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "eic_report_status" AS ENUM (
        'IN_PROGRESS', 'PENDING_SIGNATURE', 'SIGNED', 'PUBLISHED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "eic_progress_reports" (
        "id"                  UUID                    NOT NULL DEFAULT gen_random_uuid(),
        "enrollment_id"       UUID                    NOT NULL,
        "report_number"       SMALLINT                NOT NULL DEFAULT 1,
        "period_from"         DATE                    NOT NULL,
        "period_to"           DATE                    NOT NULL,
        "status"              "eic_report_status"     NOT NULL DEFAULT 'IN_PROGRESS',
        "signed_by"           UUID                    NULL,
        "signed_at"           TIMESTAMPTZ             NULL,
        "signatory_name"      VARCHAR(200)            NULL,
        "signatory_designation" VARCHAR(200)          NULL,
        "initiated_by"        UUID                    NULL,
        "created_at"          TIMESTAMPTZ             NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ             NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_progress_reports" PRIMARY KEY ("id"),
        CONSTRAINT "fk_eic_progress_report_enrollment"
          FOREIGN KEY ("enrollment_id") REFERENCES "eic_therapy_enrollments"("id") ON DELETE RESTRICT
      )
    `);

    // ── 10. eic_discipline_progress_sections ──────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "eic_section_status" AS ENUM ('PENDING', 'SUBMITTED', 'AMENDMENT_REQUESTED')
    `);

    await queryRunner.query(`
      CREATE TABLE "eic_discipline_progress_sections" (
        "id"                UUID                    NOT NULL DEFAULT gen_random_uuid(),
        "progress_report_id" UUID                   NOT NULL,
        "discipline"        "eic_discipline"        NOT NULL,
        "therapist_id"      UUID                    NULL,
        "therapist_name"    VARCHAR(200)            NULL,
        "status"            "eic_section_status"    NOT NULL DEFAULT 'PENDING',
        "sessions_held"     SMALLINT                NULL,
        "goals_achieved"    SMALLINT                NULL,
        "goals_in_progress" SMALLINT                NULL,
        "goals_carried"     SMALLINT                NULL,
        "functional_progress" TEXT                  NULL,
        "recommendations"   TEXT                    NULL,
        "next_period_goals" TEXT                    NULL,
        "section_data"      JSONB                   NULL DEFAULT '{}',
        "submitted_at"      TIMESTAMPTZ             NULL,
        "created_at"        TIMESTAMPTZ             NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ             NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_discipline_sections" PRIMARY KEY ("id"),
        CONSTRAINT "uq_eic_discipline_section"
          UNIQUE ("progress_report_id", "discipline"),
        CONSTRAINT "fk_eic_discipline_section_report"
          FOREIGN KEY ("progress_report_id") REFERENCES "eic_progress_reports"("id") ON DELETE CASCADE
      )
    `);

    // ── 11. eic_discharge_summaries ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "eic_discharge_status" AS ENUM (
        'DRAFT', 'PENDING_SECTIONS', 'PENDING_SIGNATURE', 'SIGNED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "eic_discharge_summaries" (
        "id"                    UUID                      NOT NULL DEFAULT gen_random_uuid(),
        "enrollment_id"         UUID                      NOT NULL,
        "discharge_reason"      VARCHAR(100)              NOT NULL,
        "discharge_date"        DATE                      NOT NULL,
        "status"                "eic_discharge_status"    NOT NULL DEFAULT 'DRAFT',
        "overall_progress"      TEXT                      NULL,
        "home_programme"        TEXT                      NULL,
        "follow_up_plan"        TEXT                      NULL,
        "signed_by"             UUID                      NULL,
        "signed_at"             TIMESTAMPTZ               NULL,
        "signatory_name"        VARCHAR(200)              NULL,
        "signatory_designation" VARCHAR(200)              NULL,
        "initiated_by"          UUID                      NULL,
        "created_at"            TIMESTAMPTZ               NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ               NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_discharge_summaries" PRIMARY KEY ("id"),
        CONSTRAINT "uq_eic_discharge_enrollment" UNIQUE ("enrollment_id"),
        CONSTRAINT "fk_eic_discharge_enrollment"
          FOREIGN KEY ("enrollment_id") REFERENCES "eic_therapy_enrollments"("id") ON DELETE RESTRICT
      )
    `);

    // ── 12. eic_discharge_sections ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "eic_discharge_sections" (
        "id"                  UUID                    NOT NULL DEFAULT gen_random_uuid(),
        "discharge_id"        UUID                    NOT NULL,
        "discipline"          "eic_discipline"        NOT NULL,
        "therapist_id"        UUID                    NULL,
        "therapist_name"      VARCHAR(200)            NULL,
        "status"              "eic_section_status"    NOT NULL DEFAULT 'PENDING',
        "total_sessions"      SMALLINT                NULL,
        "goals_achieved"      SMALLINT                NULL,
        "functional_outcomes" TEXT                    NULL,
        "recommendations"     TEXT                    NULL,
        "section_data"        JSONB                   NULL DEFAULT '{}',
        "submitted_at"        TIMESTAMPTZ             NULL,
        "created_at"          TIMESTAMPTZ             NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ             NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_discharge_sections" PRIMARY KEY ("id"),
        CONSTRAINT "uq_eic_discharge_section"
          UNIQUE ("discharge_id", "discipline"),
        CONSTRAINT "fk_eic_discharge_section_discharge"
          FOREIGN KEY ("discharge_id") REFERENCES "eic_discharge_summaries"("id") ON DELETE CASCADE
      )
    `);

    // ── 13. eic_preschool_enrollments ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "eic_preschool_enrollments" (
        "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
        "patient_id"        UUID          NOT NULL,
        "enrollment_number" VARCHAR(30)   NOT NULL,
        "admission_date"    DATE          NOT NULL,
        "discharge_date"    DATE          NULL,
        "class_group"       VARCHAR(50)   NULL,
        "teacher_id"        UUID          NULL,
        "teacher_name"      VARCHAR(200)  NULL,
        "status"            VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
        "notes"             TEXT          NULL,
        "created_by"        UUID          NULL,
        "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_preschool_enrollments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_eic_preschool_enrollment_number" UNIQUE ("enrollment_number"),
        CONSTRAINT "fk_eic_preschool_patient"
          FOREIGN KEY ("patient_id") REFERENCES "eic_patients"("id") ON DELETE RESTRICT
      )
    `);

    // ── 14. eic_preschool_assessments ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "eic_preschool_assessments" (
        "id"                      UUID          NOT NULL DEFAULT gen_random_uuid(),
        "preschool_enrollment_id" UUID          NOT NULL,
        "assessment_date"         DATE          NOT NULL,
        "assessed_by"             UUID          NULL,
        "assessor_name"           VARCHAR(200)  NULL,
        "language_communication"  JSONB         NULL DEFAULT '{}',
        "adl_self_help"           JSONB         NULL DEFAULT '{}',
        "social_emotional"        JSONB         NULL DEFAULT '{}',
        "pre_academic"            JSONB         NULL DEFAULT '{}',
        "conceptual_understanding" JSONB        NULL DEFAULT '{}',
        "gross_motor"             JSONB         NULL DEFAULT '{}',
        "fine_motor"              JSONB         NULL DEFAULT '{}',
        "recommendations"         TEXT          NULL,
        "goals"                   JSONB         NULL DEFAULT '[]',
        "status"                  VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
        "created_at"              TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_preschool_assessments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_eic_preschool_assessment_enrollment"
          FOREIGN KEY ("preschool_enrollment_id") REFERENCES "eic_preschool_enrollments"("id") ON DELETE RESTRICT
      )
    `);

    // ── 15. eic_preschool_daily_reports ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "eic_preschool_daily_reports" (
        "id"                      UUID          NOT NULL DEFAULT gen_random_uuid(),
        "preschool_enrollment_id" UUID          NOT NULL,
        "report_date"             DATE          NOT NULL,
        "attendance"              VARCHAR(20)   NOT NULL DEFAULT 'PRESENT',
        "mood_on_arrival"         VARCHAR(30)   NULL,
        "curriculum_activities"   JSONB         NULL DEFAULT '[]',
        "adl_performance"         JSONB         NULL DEFAULT '{}',
        "behaviour_observations"  TEXT          NULL,
        "home_practice"           TEXT          NULL,
        "teacher_remarks"         TEXT          NULL,
        "submitted_by"            UUID          NULL,
        "submitted_at"            TIMESTAMPTZ   NULL,
        "created_at"              TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_preschool_daily_reports" PRIMARY KEY ("id"),
        CONSTRAINT "uq_eic_preschool_daily_report_date"
          UNIQUE ("preschool_enrollment_id", "report_date"),
        CONSTRAINT "fk_eic_preschool_daily_enrollment"
          FOREIGN KEY ("preschool_enrollment_id") REFERENCES "eic_preschool_enrollments"("id") ON DELETE RESTRICT
      )
    `);

    // ── Indexes ───────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX "idx_eic_patients_mrn"       ON "eic_patients"("mrn")`);
    await queryRunner.query(`CREATE INDEX "idx_eic_patients_fullname"   ON "eic_patients"("full_name")`);
    await queryRunner.query(`CREATE INDEX "idx_eic_enrollments_patient" ON "eic_therapy_enrollments"("patient_id")`);
    await queryRunner.query(`CREATE INDEX "idx_eic_enrollments_status"  ON "eic_therapy_enrollments"("status")`);
    await queryRunner.query(`CREATE INDEX "idx_eic_assessments_enroll"  ON "eic_assessments"("enrollment_id", "discipline")`);
    await queryRunner.query(`CREATE INDEX "idx_eic_goals_enroll"        ON "eic_goals"("enrollment_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_eic_sessions_enroll"     ON "eic_therapy_sessions"("enrollment_id", "discipline", "session_date")`);
    await queryRunner.query(`CREATE INDEX "idx_eic_session_entries"     ON "eic_session_entries"("session_id")`);
    await queryRunner.query(`CREATE INDEX "idx_eic_progress_enroll"     ON "eic_progress_reports"("enrollment_id")`);
    await queryRunner.query(`CREATE INDEX "idx_eic_team_enroll"         ON "eic_therapy_team_members"("enrollment_id", "is_active")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_team_enroll"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_progress_enroll"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_session_entries"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_sessions_enroll"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_goals_enroll"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_assessments_enroll"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_enrollments_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_enrollments_patient"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_patients_fullname"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_patients_mrn"`);

    // Tables (reverse order to respect FKs)
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_preschool_daily_reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_preschool_assessments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_preschool_enrollments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_discharge_sections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_discharge_summaries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_discipline_progress_sections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_progress_reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_session_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_therapy_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_goals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_assessments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_therapy_team_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_therapy_enrollments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_developmental_histories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_patients"`);

    // ENUMs
    await queryRunner.query(`DROP TYPE IF EXISTS "eic_section_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "eic_discharge_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "eic_report_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "eic_session_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "eic_goal_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "eic_goal_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "eic_assessment_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "eic_discipline"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "eic_enrollment_status"`);
  }
}
