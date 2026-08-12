import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a single-date exception table for the Children's Village recurring
 * weekly timetable grid (`cv_timetable_periods`). Without this, any edit to
 * a period changed every future occurrence of that weekday -- there was no
 * way to say "just move today's slot" versus "move this slot from now on".
 * See `CvTimetablePeriodOverride` entity for the field-by-field contract
 * (null column = inherit from the base period).
 */
export class CreateCvTimetablePeriodOverrides_1790100000000 implements MigrationInterface {
  name = 'CreateCvTimetablePeriodOverrides_1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cv_timetable_period_overrides" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "period_id" uuid NOT NULL,
        "date" date NOT NULL,
        "subject_id" uuid,
        "room" character varying(100),
        "start_time" time,
        "end_time" time,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_timetable_period_overrides" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_tt_period_overrides_period" FOREIGN KEY ("period_id") REFERENCES "cv_timetable_periods"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_CV_TT_PERIOD_OVERRIDE_PERIOD_DATE" ON "cv_timetable_period_overrides" ("period_id", "date")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_PERIOD_OVERRIDE_TENANT_DATE" ON "cv_timetable_period_overrides" ("tenant_id", "date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_CV_TT_PERIOD_OVERRIDE_TENANT_DATE"`);
    await queryRunner.query(`DROP INDEX "IDX_CV_TT_PERIOD_OVERRIDE_PERIOD_DATE"`);
    await queryRunner.query(`DROP TABLE "cv_timetable_period_overrides"`);
  }
}
