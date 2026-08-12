import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * therapist_id columns were incorrectly typed as UUID.
 * Therapists are HIS doctors (doctorCode = any string), not system users.
 * Convert to VARCHAR(100) across all EIC tables.
 */
export class EicTherapistIdToVarchar1700000012000 implements MigrationInterface {
  name = 'EicTherapistIdToVarchar1700000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE eic_assessments
        ALTER COLUMN therapist_id TYPE VARCHAR(100) USING therapist_id::text
    `);
    await queryRunner.query(`
      ALTER TABLE eic_therapy_sessions
        ALTER COLUMN therapist_id TYPE VARCHAR(100) USING therapist_id::text
    `);
    await queryRunner.query(`
      ALTER TABLE eic_therapy_team_members
        ALTER COLUMN therapist_id TYPE VARCHAR(100) USING therapist_id::text
    `);
    await queryRunner.query(`
      ALTER TABLE eic_discipline_progress_sections
        ALTER COLUMN therapist_id TYPE VARCHAR(100) USING therapist_id::text
    `);
    await queryRunner.query(`
      ALTER TABLE eic_discharge_sections
        ALTER COLUMN therapist_id TYPE VARCHAR(100) USING therapist_id::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse only if values are valid UUIDs
    await queryRunner.query(`
      ALTER TABLE eic_assessments
        ALTER COLUMN therapist_id TYPE UUID USING therapist_id::uuid
    `);
    await queryRunner.query(`
      ALTER TABLE eic_therapy_sessions
        ALTER COLUMN therapist_id TYPE UUID USING therapist_id::uuid
    `);
    await queryRunner.query(`
      ALTER TABLE eic_therapy_team_members
        ALTER COLUMN therapist_id TYPE UUID USING therapist_id::uuid
    `);
    await queryRunner.query(`
      ALTER TABLE eic_discipline_progress_sections
        ALTER COLUMN therapist_id TYPE UUID USING therapist_id::uuid
    `);
    await queryRunner.query(`
      ALTER TABLE eic_discharge_sections
        ALTER COLUMN therapist_id TYPE UUID USING therapist_id::uuid
    `);
  }
}
