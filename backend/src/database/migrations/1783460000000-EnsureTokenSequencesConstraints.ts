import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Same root cause as EnsureTokenRecordsRegisteredAt1783440000000 and
 * EnsureTokenRecordsRegistrationColumns1783450000000:
 * ConsolidateRecentChanges1783326737784 drops "uq_token_sequences_unique"
 * (line 199) and "chk_token_sequences_type" (implicitly re-created at line
 * 1138) within a single up(), then re-adds the unique constraint at line
 * 1105. On this environment that migration clearly did not fully apply --
 * "there is no unique or exclusion constraint matching the ON CONFLICT
 * specification" on TokenSequenceService.getNextToken's
 * `ON CONFLICT (branch_id, reference_type, reference_id, seq_date)` confirms
 * uq_token_sequences_unique never made it back onto token_sequences.
 *
 * Purely additive/idempotent.
 */
export class EnsureTokenSequencesConstraints1783460000000 implements MigrationInterface {
  name = 'EnsureTokenSequencesConstraints1783460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'uq_token_sequences_unique'`,
    );
    if (!exists || exists.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "token_sequences" ADD CONSTRAINT "uq_token_sequences_unique" UNIQUE ("branch_id", "reference_type", "reference_id", "seq_date")`,
      );
    }

    const checkExists = await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'chk_token_sequences_type'`,
    );
    if (!checkExists || checkExists.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "token_sequences" ADD CONSTRAINT "chk_token_sequences_type" CHECK (((reference_type)::text = ANY ((ARRAY['LOCATION'::character varying, 'SERVICE_CENTER'::character varying])::text[])))`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op -- see the sibling hotfix migrations' down() for the same reasoning.
  }
}
