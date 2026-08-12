import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'RESET' to the token_audit_logs.action check constraint.
 * The manual token-counter reset action needs to be recorded in the audit log.
 */
export class AddResetToAuditLogAction1751400000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE token_audit_logs DROP CONSTRAINT IF EXISTS chk_tal_action
    `);
    await queryRunner.query(`
      ALTER TABLE token_audit_logs
        ADD CONSTRAINT chk_tal_action
        CHECK (action IN ('CREATE','UPDATE','DELETE','ARCHIVE','ENABLE','DISABLE','RESET'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE token_audit_logs DROP CONSTRAINT IF EXISTS chk_tal_action
    `);
    await queryRunner.query(`
      ALTER TABLE token_audit_logs
        ADD CONSTRAINT chk_tal_action
        CHECK (action IN ('CREATE','UPDATE','DELETE','ARCHIVE','ENABLE','DISABLE'))
    `);
  }
}
