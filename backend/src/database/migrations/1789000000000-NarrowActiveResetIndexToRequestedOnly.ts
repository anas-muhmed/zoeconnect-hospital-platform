import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `forgotPassword()`'s duplicate-active-request guard (and the
 * `uq_one_active_reset_per_user` partial unique index backing it at the DB
 * level, see 1783400000000-CreatePasswordResetRequestsTable.ts) originally
 * treated both `REQUESTED` and `APPROVED` as "active" -- blocking a new
 * request for the full 24h reset-TTL window even after the existing one had
 * already been reviewed and a temporary password issued.
 *
 * That's wrong: `APPROVED` means the request has already been resolved (a
 * temp password exists, `mustChangePassword` is set) -- it isn't "pending"
 * anymore, it's done. Only `REQUESTED` (awaiting review) should block a
 * second submission; once approved or rejected, a new forgotPassword() call
 * should be free to create a fresh request exactly like it can today when
 * the prior one has already gone to `COMPLETED`/`EXPIRED`.
 *
 * Narrows the partial unique index to `status = 'REQUESTED'` only, matching
 * the corresponding application-level check now narrowed in
 * PasswordResetService.forgotPassword().
 */
export class NarrowActiveResetIndexToRequestedOnly1789000000000
  implements MigrationInterface
{
  name = 'NarrowActiveResetIndexToRequestedOnly1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_one_active_reset_per_user"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_one_active_reset_per_user"
        ON "password_reset_requests" ("user_id")
        WHERE "status" = 'REQUESTED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_one_active_reset_per_user"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_one_active_reset_per_user"
        ON "password_reset_requests" ("user_id")
        WHERE "status" IN ('REQUESTED', 'APPROVED')
    `);
  }
}
