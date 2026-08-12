import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCVPhase8_1789900000000 implements MigrationInterface {
  name = 'CreateCVPhase8_1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cv_eic_goal_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "cv_goal_id" uuid NOT NULL,
        "eic_goal_id" uuid NOT NULL,
        "linked_by" uuid NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_eic_goal_links" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_EIC_GOAL_LINKS_TENANT" ON "cv_eic_goal_links" ("tenant_id")`);
    await queryRunner.query(`ALTER TABLE "cv_eic_goal_links" ADD CONSTRAINT "FK_CV_EIC_GOAL_LINK_CV" FOREIGN KEY ("cv_goal_id") REFERENCES "cv_iep_goals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE "cv_eic_referrals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "referred_by" uuid NOT NULL,
        "requested_disciplines" jsonb NOT NULL,
        "reason_for_referral" text NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'DRAFT',
        "status_history" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_eic_referrals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_EIC_REFERRALS_TENANT" ON "cv_eic_referrals" ("tenant_id", "student_id")`);
    await queryRunner.query(`ALTER TABLE "cv_eic_referrals" ADD CONSTRAINT "FK_CV_EIC_REF_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE "cv_therapy_carryovers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "class_id" uuid,
        "eic_goal_id" uuid,
        "assigned_by" uuid NOT NULL,
        "activity_description" text NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'ACTIVE',
        "teacher_completion_notes" text,
        "completed_at" timestamp,
        "completed_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_therapy_carryovers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_THERAPY_CARRYOVERS_TENANT" ON "cv_therapy_carryovers" ("tenant_id", "student_id")`);
    await queryRunner.query(`ALTER TABLE "cv_therapy_carryovers" ADD CONSTRAINT "FK_CV_CARRY_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cv_therapy_carryovers" DROP CONSTRAINT "FK_CV_CARRY_STUDENT"`);
    await queryRunner.query(`DROP TABLE "cv_therapy_carryovers"`);

    await queryRunner.query(`ALTER TABLE "cv_eic_referrals" DROP CONSTRAINT "FK_CV_EIC_REF_STUDENT"`);
    await queryRunner.query(`DROP TABLE "cv_eic_referrals"`);

    await queryRunner.query(`ALTER TABLE "cv_eic_goal_links" DROP CONSTRAINT "FK_CV_EIC_GOAL_LINK_CV"`);
    await queryRunner.query(`DROP TABLE "cv_eic_goal_links"`);
  }
}
