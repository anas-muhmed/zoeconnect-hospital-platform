import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCVPhase6_1789700000000 implements MigrationInterface {
  name = 'CreateCVPhase6_1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Reporting Entities
    await queryRunner.query(`
      CREATE TABLE "cv_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "type" varchar(50) NOT NULL,
        "config" jsonb NOT NULL,
        "created_by" uuid NOT NULL,
        "is_shared" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_reports" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_REPORTS_TENANT" ON "cv_reports" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_report_exports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "report_id" uuid,
        "format" varchar(20) NOT NULL,
        "status" varchar(50) NOT NULL,
        "file_url" varchar(1024),
        "requested_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_report_exports" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_REPORT_EXPORTS_TENANT" ON "cv_report_exports" ("tenant_id")`);

    // 2. Analytics Entities
    await queryRunner.query(`
      CREATE TABLE "cv_analytics_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "snapshot_date" date NOT NULL,
        "level" varchar(20) NOT NULL,
        "student_id" uuid,
        "class_id" uuid,
        "metrics" jsonb NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_analytics_snapshots" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_SNAPSHOTS_TENANT_DATE" ON "cv_analytics_snapshots" ("tenant_id", "snapshot_date")`);
    await queryRunner.query(`CREATE INDEX "IDX_CV_SNAPSHOTS_STUDENT" ON "cv_analytics_snapshots" ("tenant_id", "student_id", "snapshot_date")`);

    await queryRunner.query(`
      CREATE TABLE "cv_event_timeline" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "student_id" uuid,
        "event_type" varchar(50) NOT NULL,
        "event_date" timestamp NOT NULL,
        "actor_id" uuid,
        "payload" jsonb NOT NULL,
        "source_entity_id" uuid,
        "source_entity_type" varchar(50),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_event_timeline" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_TIMELINE_TENANT" ON "cv_event_timeline" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_CV_TIMELINE_STUDENT" ON "cv_event_timeline" ("tenant_id", "student_id")`);

    // 3. Notification Entities
    await queryRunner.query(`
      CREATE TABLE "cv_alerts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "student_id" uuid,
        "type" varchar(50) NOT NULL,
        "severity" varchar(20) NOT NULL,
        "message" text NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb,
        "actioned_by" uuid,
        "actioned_at" timestamp,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_alerts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_ALERTS_TENANT" ON "cv_alerts" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_CV_ALERTS_STUDENT" ON "cv_alerts" ("tenant_id", "student_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_CV_ALERTS_STATUS" ON "cv_alerts" ("tenant_id", "status")`);

    // Foreign Keys
    await queryRunner.query(`ALTER TABLE "cv_report_exports" ADD CONSTRAINT "FK_CV_REP_EXP_REPORT" FOREIGN KEY ("report_id") REFERENCES "cv_reports"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cv_report_exports" DROP CONSTRAINT "FK_CV_REP_EXP_REPORT"`);
    
    await queryRunner.query(`DROP TABLE "cv_alerts"`);
    await queryRunner.query(`DROP TABLE "cv_event_timeline"`);
    await queryRunner.query(`DROP TABLE "cv_analytics_snapshots"`);
    await queryRunner.query(`DROP TABLE "cv_report_exports"`);
    await queryRunner.query(`DROP TABLE "cv_reports"`);
  }
}
