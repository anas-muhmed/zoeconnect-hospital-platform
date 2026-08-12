import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateHospitalSettings1783347106019 implements MigrationInterface {
    name = 'CreateHospitalSettings1783347106019'

    // Guarded for the same class of reason as the two migrations before
    // this one (RenameWebhookSecret / AddInstanceSecretToHospital): this
    // environment's schema was evidently created via `synchronize: true`
    // against the current entities directly (see HospitalSetting entity in
    // ../../modules/hospitals/entities/hospital-setting.entity.ts) rather
    // than by running these migrations in order, so `hospital_settings`
    // already exists with a matching shape by the time this unconditional
    // `CREATE TABLE` runs. Skip cleanly if it's already there instead of
    // failing on "relation already exists".
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasHospitalTable = await queryRunner.hasTable('hospitals');
        if (!hasHospitalTable) return;

        const hasTable = await queryRunner.hasTable('hospital_settings');
        if (hasTable) {
            return;
        }
        await queryRunner.query(`CREATE TABLE "hospital_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "hospital_id" uuid NOT NULL, "setting_key" character varying(100) NOT NULL, "setting_value" text NOT NULL, "label" character varying(150) NOT NULL, "description" text, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_89f08dfcc7a6d7272b90e27fd73" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f0f83b0603ffbc7bb845dbbe98" ON "hospital_settings" ("hospital_id", "setting_key") `);
        await queryRunner.query(`ALTER TABLE "hospital_settings" ADD CONSTRAINT "FK_4b84637a7bf5cdbebb7dfa8d50c" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasHospitalTable = await queryRunner.hasTable('hospitals');
        if (!hasHospitalTable) return;

        const hasTable = await queryRunner.hasTable('hospital_settings');
        if (!hasTable) {
            return;
        }
        await queryRunner.query(`ALTER TABLE "hospital_settings" DROP CONSTRAINT "FK_4b84637a7bf5cdbebb7dfa8d50c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0f83b0603ffbc7bb845dbbe98"`);
        await queryRunner.query(`DROP TABLE "hospital_settings"`);
    }

}
