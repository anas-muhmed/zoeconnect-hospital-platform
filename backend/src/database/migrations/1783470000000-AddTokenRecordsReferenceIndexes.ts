import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * token_records has no supporting index beyond its primary key. Every query
 * this feature relies on filters by (reference_type, reference_id) plus one
 * more column:
 *   - callToken()/callServiceCenterToken(): WHERE reference_type, reference_id, token_number
 *   - TokenQueueService.getWaitingQueue()/getRecentCalled(): WHERE ..., status
 *   - TokenService.getServiceCenterLocationState(): WHERE ..., issued_at range
 *
 * With no index, each of these is a sequential scan over the whole table --
 * fine on a nearly-empty dev table, increasingly slow as tokens accumulate.
 * This was the direct cause of "calling a token takes 4-5 seconds" for
 * SERVICE_CENTER-mode locations: the single blocking findOne() inside
 * callServiceCenterToken() (fired before the client ever sees token:called)
 * paid a full table scan on every call.
 */
export class AddTokenRecordsReferenceIndexes1783470000000 implements MigrationInterface {
  name = 'AddTokenRecordsReferenceIndexes1783470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_token_records_ref_number" ON "token_records" ("reference_type", "reference_id", "token_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_token_records_ref_status" ON "token_records" ("reference_type", "reference_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_token_records_ref_issued" ON "token_records" ("reference_type", "reference_id", "issued_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_token_records_ref_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_token_records_ref_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_token_records_ref_issued"`);
  }
}
