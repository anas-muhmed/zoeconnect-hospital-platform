import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRecoveryAccountFields1783341110006 implements MigrationInterface {
    name = 'AddRecoveryAccountFields1783341110006'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_recovery_account" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_expires_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "account_expires_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_recovery_account"`);
    }
}
