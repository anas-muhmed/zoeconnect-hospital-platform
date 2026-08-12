import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameWebhookSecret1783325049767 implements MigrationInterface {
    name = 'RenameWebhookSecret1783325049767'

    // Guarded rather than unconditional: this migration predates
    // `AddInstanceSecretToHospital1783341244304` and only makes sense for a
    // database whose `hospitals` table still has the pre-rename
    // `webhook_secret` column (i.e. was created via `synchronize: true`
    // against an older entity definition, before it was renamed to
    // `instanceSecret` / `instance_secret` -- see hospital.entity.ts).
    // `webhook_secret` doesn't appear anywhere else in this codebase --
    // the current entity, service, and every other migration only ever
    // reference `instance_secret` -- so on any database that never had the
    // old column (every fresh install, and any environment whose schema
    // was created after the entity rename), this ran unconditionally and
    // failed with "column webhook_secret does not exist" even though
    // there was nothing wrong to fix. Checking first makes it a safe
    // no-op there while still performing the real rename on genuinely
    // legacy databases that do have the old column.
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasOldColumn = await queryRunner.hasColumn('hospitals', 'webhook_secret');
        if (!hasOldColumn) {
            return;
        }
        await queryRunner.query(`ALTER TABLE "hospitals" RENAME COLUMN "webhook_secret" TO "instance_secret"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasNewColumn = await queryRunner.hasColumn('hospitals', 'instance_secret');
        if (!hasNewColumn) {
            return;
        }
        await queryRunner.query(`ALTER TABLE "hospitals" RENAME COLUMN "instance_secret" TO "webhook_secret"`);
    }

}
