import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCVStudentsPhase2_1789300000000 implements MigrationInterface {
  name = 'CreateCVStudentsPhase2_1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cv_students" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "registration_number" varchar(100) NOT NULL,
        "first_name" varchar(150) NOT NULL,
        "last_name" varchar(150) NOT NULL,
        "date_of_birth" date,
        "gender" varchar(20),
        "parent_name" varchar(255),
        "parent_contact" varchar(100),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "created_by" uuid,
        "updated_by" uuid,
        CONSTRAINT "pk_cv_students" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cv_students_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);

    // Indexes for tenant scoping and performance
    await queryRunner.query(`CREATE INDEX "idx_cv_students_tenant_id" ON "cv_students" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_cv_students_hospital_id" ON "cv_students" ("hospital_id")`);
    await queryRunner.query(`CREATE INDEX "idx_cv_students_registration_number" ON "cv_students" ("tenant_id", "registration_number")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_cv_students_registration_number"`);
    await queryRunner.query(`DROP INDEX "idx_cv_students_hospital_id"`);
    await queryRunner.query(`DROP INDEX "idx_cv_students_tenant_id"`);
    await queryRunner.query(`ALTER TABLE "cv_students" DROP CONSTRAINT "fk_cv_students_tenant"`);
    await queryRunner.query(`DROP TABLE "cv_students"`);
  }
}
