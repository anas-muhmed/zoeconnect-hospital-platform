import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Set DEFAULT '2' (ALMAS — the main branch) on every branch_id column
 * added in the previous migration, and backfill all existing NULLs.
 *
 * Branch ID 2 in Oracle orgstructure = ALMAS (the root/default hospital).
 * Any record created before branch-awareness was introduced is assumed to
 * belong to this default branch.
 */
export class BranchIdDefaultToAlmas1700000022000 implements MigrationInterface {
  name = 'BranchIdDefaultToAlmas1700000022000';

  private readonly DEFAULT_BRANCH = '2';

  async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ['token_locations', 'loyalty_accounts', 'eic_patients'];

    for (const table of tables) {
      // Set column default
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "branch_id" SET DEFAULT '${this.DEFAULT_BRANCH}'`,
      );
      // Backfill existing NULLs
      await queryRunner.query(
        `UPDATE "${table}" SET "branch_id" = '${this.DEFAULT_BRANCH}' WHERE "branch_id" IS NULL`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['token_locations', 'loyalty_accounts', 'eic_patients'];
    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "branch_id" DROP DEFAULT`);
    }
  }
}
