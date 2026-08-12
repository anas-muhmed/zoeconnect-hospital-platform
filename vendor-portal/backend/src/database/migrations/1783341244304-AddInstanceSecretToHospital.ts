import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInstanceSecretToHospital1783341244304 implements MigrationInterface {

    // Guarded for the same reason as RenameWebhookSecret1783325049767's own
    // guard (see that migration's comment): on a legacy database that still
    // had `webhook_secret`, the prior migration renames it to
    // `instance_secret`, which would make this unconditional `ADD COLUMN`
    // fail with "column already exists" immediately afterward. Only add the
    // column if it isn't already there, regardless of which path (rename or
    // synchronize) got it there first.
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasTable = await queryRunner.hasTable('hospitals');
        if (!hasTable) return;

        const hasColumn = await queryRunner.hasColumn('hospitals', 'instance_secret');
        if (hasColumn) {
            return;
        }
        await queryRunner.query(`ALTER TABLE "hospitals" ADD "instance_secret" character varying(128) NOT NULL DEFAULT 'legacy-secret'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasTable = await queryRunner.hasTable('hospitals');
        if (!hasTable) return;

        const hasColumn = await queryRunner.hasColumn('hospitals', 'instance_secret');
        if (!hasColumn) {
            return;
        }
        await queryRunner.query(`ALTER TABLE "hospitals" DROP COLUMN "instance_secret"`);
    }

}
