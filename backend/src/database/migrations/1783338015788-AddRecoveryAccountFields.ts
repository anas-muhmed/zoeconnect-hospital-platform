import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRecoveryAccountFields1783338015788 implements MigrationInterface {
    name = 'AddRecoveryAccountFields1783338015788'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "is_recovery_account" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "account_expires_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "account_expires_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_recovery_account"`);
    }
}
