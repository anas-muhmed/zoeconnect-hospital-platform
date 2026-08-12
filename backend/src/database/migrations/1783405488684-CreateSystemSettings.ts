import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSystemSettings1783405488684 implements MigrationInterface {
    name = 'CreateSystemSettings1783405488684'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "system_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "setting_key" character varying(100) NOT NULL, "setting_value" text NOT NULL, "label" character varying(150), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_9037e7dec102dfdfb0c5343807f" UNIQUE ("setting_key"), CONSTRAINT "PK_82521f08790d248b2a80cc85d40" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "system_settings"`);
    }
}
