import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registration Widget -- Phase 1b
 *
 * Creates the three tables that power the HIS Registration Widget:
 *
 *   token_reservations     -- temporary lock while receptionist registers a patient.
 *                             A reservation is a technical mechanism, not a business
 *                             state. The token_records.status remains CALLED/WAITING.
 *                             Two partial unique indexes enforce:
 *                               (a) only one active reservation per token
 *                               (b) only one active reservation per user
 *
 *   token_patient_mapping  -- persistent record binding a token to an HIS patient.
 *                             visit_id is nullable: Stage 1 maps token to patient,
 *                             Stage 2 (optional) updates visit_id when a visit exists.
 *
 *   mapping_audit_log      -- immutable append-only log of every event in the
 *                             patient mapping lifecycle, including supervisor resets.
 *
 * Permissions added (module TOKEN):
 *   REGISTRATION / RESERVE          -- reserve a token (receptionists)
 *   REGISTRATION / MAP_PATIENT      -- bind token to patient after HIS registration
 *   REGISTRATION / MAP_VISIT        -- bind visit_id to an existing mapping
 *   REGISTRATION / SUPERVISOR_RESET -- reset a REGISTERED token (supervisors only)
 *
 * Roles added:
 *   TOKEN_RECEPTIONIST -- reception staff; RESERVE + MAP_PATIENT + MAP_VISIT
 *   TOKEN_SUPERVISOR   -- senior staff; all of the above + SUPERVISOR_RESET
 */
export class CreateRegistrationMappingSchema1751800000002
  implements MigrationInterface
{
  name = 'CreateRegistrationMappingSchema1751800000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. token_reservations ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_reservations" (
        "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
        "token_record_id"   UUID         NOT NULL,
        "token_number"      VARCHAR(20)  NOT NULL,
        "reservation_id"    UUID         NOT NULL,
        "reserved_by_user"  VARCHAR(100) NOT NULL,
        "reserved_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "expires_at"        TIMESTAMPTZ  NOT NULL,
        "last_heartbeat_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "released_at"       TIMESTAMPTZ,
        "release_reason"    VARCHAR(30),
        CONSTRAINT "pk_token_reservations"
          PRIMARY KEY ("id"),
        CONSTRAINT "fk_tr_token_record"
          FOREIGN KEY ("token_record_id") REFERENCES "token_records"("id")
          ON DELETE CASCADE,
        CONSTRAINT "chk_tr_release_reason"
          CHECK ("release_reason" IS NULL OR "release_reason" IN (
            'MAPPED', 'EXPIRED', 'MANUAL_RELEASE'
          ))
      )
    `);

    // One active reservation per token at any moment
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_one_reservation_per_token"
        ON "token_reservations" ("token_record_id")
        WHERE "released_at" IS NULL
    `);

    // One active reservation per user -- enforces one-patient-at-a-time rule
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_one_reservation_per_user"
        ON "token_reservations" ("reserved_by_user")
        WHERE "released_at" IS NULL
    `);

    // Fast lookup for heartbeat / release / expiry sweep
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tr_expires_active"
        ON "token_reservations" ("expires_at")
        WHERE "released_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tr_reservation_id"
        ON "token_reservations" ("reservation_id")
    `);

    // ── 2. token_patient_mapping ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_patient_mapping" (
        "id"                        UUID         NOT NULL DEFAULT gen_random_uuid(),
        "token_record_id"           UUID         NOT NULL,
        "token_number"              VARCHAR(20)  NOT NULL,
        "his_patient_id"            VARCHAR(100) NOT NULL,
        "mrn"                       VARCHAR(50)  NOT NULL,
        "patient_name"              VARCHAR(200),
        "visit_id"                  VARCHAR(100),
        "mapped_by"                 VARCHAR(100) NOT NULL,
        "mapped_at"                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "visit_mapped_at"           TIMESTAMPTZ,
        "registration_completed_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "metadata"                  JSONB        NOT NULL DEFAULT '{}',
        "created_at"                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_token_patient_mapping"
          PRIMARY KEY ("id"),
        CONSTRAINT "uq_token_patient_mapping_token"
          UNIQUE ("token_record_id"),
        CONSTRAINT "fk_tpm_token_record"
          FOREIGN KEY ("token_record_id") REFERENCES "token_records"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tpm_mrn"
        ON "token_patient_mapping" ("mrn")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tpm_his_patient_id"
        ON "token_patient_mapping" ("his_patient_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tpm_token_number"
        ON "token_patient_mapping" ("token_number")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tpm_mapped_at"
        ON "token_patient_mapping" ("mapped_at" DESC)
    `);

    // Partial index for unmapped visits -- used by Stage 2 follow-up queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tpm_visit_pending"
        ON "token_patient_mapping" ("registration_completed_at" DESC)
        WHERE "visit_id" IS NULL
    `);

    // ── 3. mapping_audit_log ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mapping_audit_log" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "token_record_id" UUID,
        "mapping_id"      UUID,
        "event_type"      VARCHAR(60)  NOT NULL,
        "old_status"      VARCHAR(30),
        "new_status"      VARCHAR(30),
        "actor"           VARCHAR(100) NOT NULL,
        "ip_address"      INET,
        "payload"         JSONB        NOT NULL DEFAULT '{}',
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_mapping_audit_log"
          PRIMARY KEY ("id"),
        CONSTRAINT "fk_mal_token_record"
          FOREIGN KEY ("token_record_id") REFERENCES "token_records"("id")
          ON DELETE SET NULL,
        CONSTRAINT "fk_mal_mapping"
          FOREIGN KEY ("mapping_id") REFERENCES "token_patient_mapping"("id")
          ON DELETE SET NULL,
        CONSTRAINT "chk_mal_event_type"
          CHECK ("event_type" IN (
            'RESERVATION_CREATED',
            'RESERVATION_HEARTBEAT',
            'RESERVATION_RELEASED',
            'RESERVATION_EXPIRED',
            'PATIENT_MAPPED',
            'VISIT_MAPPED',
            'SUPERVISOR_RESET',
            'MAPPING_FAILED'
          ))
      )
    `);

    // Time-ordered lookup per token (most common query)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mal_token_time"
        ON "mapping_audit_log" ("token_record_id", "created_at" DESC)
        WHERE "token_record_id" IS NOT NULL
    `);

    // Actor lookup for supervisor audit reports
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mal_actor_time"
        ON "mapping_audit_log" ("actor", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mal_event_type"
        ON "mapping_audit_log" ("event_type", "created_at" DESC)
    `);

    // ── 4. Permissions ───────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code","resource","action","description")
      VALUES
        ('TOKEN','REGISTRATION','RESERVE',
         'Reserve a token before HIS registration begins'),
        ('TOKEN','REGISTRATION','MAP_PATIENT',
         'Bind a token to a patient after successful HIS registration'),
        ('TOKEN','REGISTRATION','MAP_VISIT',
         'Bind a visit ID to an existing patient mapping'),
        ('TOKEN','REGISTRATION','SUPERVISOR_RESET',
         'Reset a REGISTERED token back to CALLED or WAITING')
      ON CONFLICT ("module_code","resource","action") DO NOTHING
    `);

    // ── 5. Roles ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "roles" ("name","description","is_system","module_code")
      VALUES
        ('TOKEN_RECEPTIONIST',
         'Reception staff -- reserve tokens and map patients after HIS registration',
         FALSE, 'TOKEN'),
        ('TOKEN_SUPERVISOR',
         'Senior reception staff -- all receptionist actions plus supervisor reset',
         FALSE, 'TOKEN')
      ON CONFLICT ("name") DO NOTHING
    `);

    // TOKEN_RECEPTIONIST: RESERVE + MAP_PATIENT + MAP_VISIT
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM   "roles"       r
      CROSS JOIN "permissions" p
      WHERE  r.name = 'TOKEN_RECEPTIONIST'
        AND  p.module_code = 'TOKEN'
        AND  p.resource    = 'REGISTRATION'
        AND  p.action IN ('RESERVE','MAP_PATIENT','MAP_VISIT')
      ON CONFLICT DO NOTHING
    `);

    // TOKEN_SUPERVISOR: all four permissions
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM   "roles"       r
      CROSS JOIN "permissions" p
      WHERE  r.name = 'TOKEN_SUPERVISOR'
        AND  p.module_code = 'TOKEN'
        AND  p.resource    = 'REGISTRATION'
      ON CONFLICT DO NOTHING
    `);

    // SUPER_ADMIN + HOSPITAL_ADMIN inherit all REGISTRATION permissions
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM   "roles"       r
      CROSS JOIN "permissions" p
      WHERE  r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN')
        AND  p.module_code = 'TOKEN'
        AND  p.resource    = 'REGISTRATION'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Roles and permissions
    await queryRunner.query(`
      DELETE FROM "role_permissions" rp
      USING "permissions" p
      WHERE rp.permission_id = p.id
        AND p.module_code = 'TOKEN'
        AND p.resource    = 'REGISTRATION'
    `);

    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "module_code" = 'TOKEN' AND "resource" = 'REGISTRATION'
    `);

    await queryRunner.query(`
      DELETE FROM "roles"
      WHERE "name" IN ('TOKEN_RECEPTIONIST','TOKEN_SUPERVISOR')
    `);

    // Tables -- order respects FK dependencies
    await queryRunner.query(`DROP TABLE IF EXISTS "mapping_audit_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_patient_mapping"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_reservations"`);
  }
}
