import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssetEntity1783276251575 implements MigrationInterface {
    name = 'AddAssetEntity1783276251575'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "assets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "filename" character varying(255) NOT NULL, "mimeType" character varying(100) NOT NULL, "sizeBytes" integer NOT NULL, "url" text, "base64Data" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_da96729a8b113377cfb6a62439c" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "assets"`);
    }
}
