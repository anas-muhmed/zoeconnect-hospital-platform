import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hotfix, same root cause as EnsureTokenRecordsRegisteredAt1783440000000:
 * ConsolidateRecentChanges1783326737784 drops and re-adds several
 * token_records columns within a single up() (registered_at,
 * registration_user, supervisor_reset_at, supervisor_reset_by,
 * supervisor_reset_note). On this environment that migration did not fully
 * apply -- registered_at was already found missing and fixed by
 * 1783440000000; "column t.registration_user does not exist" on
 * GET /token/registration/queue confirms the remaining four never made it
 * back either.
 *
 * Purely additive/idempotent -- safe regardless of whatever partial state
 * the earlier migration left behind. Column definitions match
 * token-record.entity.ts exactly.
 */
export class EnsureTokenRecordsRegistrationColumns1783450000000 implements MigrationInterface {
  name = 'EnsureTokenRecordsRegistrationColumns1783450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "token_records" ADD COLUMN IF NOT EXISTS "registration_user" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_records" ADD COLUMN IF NOT EXISTS "supervisor_reset_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_records" ADD COLUMN IF NOT EXISTS "supervisor_reset_by" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_records" ADD COLUMN IF NOT EXISTS "supervisor_reset_note" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op -- see EnsureTokenRecordsRegisteredAt1783440000000's down() for the same reasoning.
  }
}
