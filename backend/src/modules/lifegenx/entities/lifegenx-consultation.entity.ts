import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * LifeGenX integration. Ports Prisma's `Consultation` model — the
 * module's one real domain table (audio-derived doctor-patient
 * consultation record: transcript + AI-extracted symptoms/observations/
 * diagnoses). Tenant-scoped — a real fix, not a faithful port: the
 * source (single global SQLite file) had NO tenant concept at all, so
 * every consultation was visible to every user regardless of hospital.
 * `tenantId` is added here the same way Mortuary's D1/Drug Indenting's
 * default rule did for every other business table.
 *
 * `symptoms`/`observations`/`diagnoses` stay JSON text columns (ported
 * as-is, not normalized into child tables) — the source itself only ever
 * treats them as opaque JSON blobs (stringify on write, JSON.parse on
 * read), never queries into their structure, so normalizing them would
 * be a real redesign with no evidenced business need.
 */
@Entity('lifegenx_consultations')
export class LifeGenXConsultation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'patient_name', type: 'varchar', length: 300, default: 'Anonymous Patient' })
  patientName: string;

  @Column({ name: 'patient_age', type: 'int', nullable: true })
  patientAge: number | null;

  @Column({ name: 'patient_gender', type: 'varchar', length: 50, nullable: true, default: 'Unspecified' })
  patientGender: string | null;

  @Column({ name: 'audio_path', type: 'varchar', length: 1000, nullable: true })
  audioPath: string | null;

  @Column({ name: 'audio_file_name', type: 'varchar', length: 500, nullable: true })
  audioFileName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  duration: string | null;

  @Column({ type: 'text' })
  transcript: string;

  @Column({ type: 'text' })
  symptoms: string;

  @Column({ type: 'text' })
  observations: string;

  @Column({ type: 'text' })
  diagnoses: string;

  // Real FK, evidence-based: Prisma's source schema declares `doctor
  // User @relation(fields: [doctorId], references: [id])` as a required
  // relation -- same reasoning Drug Indenting's entities applied.
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
