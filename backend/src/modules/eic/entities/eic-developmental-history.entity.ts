import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { EicPatient } from './eic-patient.entity';

@Entity('eic_developmental_histories')
export class EicDevelopmentalHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id', type: 'uuid', unique: true })
  patientId: string;

  // Prenatal
  @Column({ name: 'pregnancy_type', type: 'varchar', length: 50, nullable: true })
  pregnancyType: string | null;

  @Column({ name: 'antenatal_complications', type: 'jsonb', nullable: true, default: [] })
  antenatalComplications: string[];

  @Column({ name: 'maternal_age_at_birth', type: 'smallint', nullable: true })
  maternalAgeAtBirth: number | null;

  // Natal
  @Column({ name: 'delivery_type', type: 'varchar', length: 50, nullable: true })
  deliveryType: string | null;

  @Column({ name: 'gestational_age_weeks', type: 'smallint', nullable: true })
  gestationalAgeWeeks: number | null;

  @Column({ name: 'birth_weight_kg', type: 'numeric', precision: 4, scale: 2, nullable: true })
  birthWeightKg: number | null;

  @Column({ name: 'birth_cry', type: 'boolean', nullable: true })
  birthCry: boolean | null;

  @Column({ name: 'nicu_stay', type: 'boolean', nullable: true })
  nicuStay: boolean | null;

  @Column({ name: 'nicu_duration_days', type: 'smallint', nullable: true })
  nicuDurationDays: number | null;

  @Column({ name: 'birth_complications', type: 'jsonb', nullable: true, default: [] })
  birthComplications: string[];

  // Postnatal
  @Column({ name: 'postnatal_jaundice', type: 'boolean', nullable: true })
  postnatalJaundice: boolean | null;

  @Column({ name: 'postnatal_seizures', type: 'boolean', nullable: true })
  postnatalSeizures: boolean | null;

  @Column({ name: 'postnatal_other', type: 'text', nullable: true })
  postnatalOther: string | null;

  // Milestones (ages in months)
  @Column({ name: 'neck_holding_months', type: 'smallint', nullable: true })
  neckHoldingMonths: number | null;

  @Column({ name: 'sitting_months', type: 'smallint', nullable: true })
  sittingMonths: number | null;

  @Column({ name: 'standing_months', type: 'smallint', nullable: true })
  standingMonths: number | null;

  @Column({ name: 'walking_months', type: 'smallint', nullable: true })
  walkingMonths: number | null;

  @Column({ name: 'first_words_months', type: 'smallint', nullable: true })
  firstWordsMonths: number | null;

  @Column({ name: 'phrases_months', type: 'smallint', nullable: true })
  phrasesMonths: number | null;

  @Column({ name: 'sentences_months', type: 'smallint', nullable: true })
  sentencesMonths: number | null;

  // Medical history
  @Column({ name: 'diagnosis', type: 'text', nullable: true })
  diagnosis: string | null;

  @Column({ name: 'co_morbidities', type: 'jsonb', nullable: true, default: [] })
  coMorbidities: string[];

  @Column({ name: 'current_medications', type: 'text', nullable: true })
  currentMedications: string | null;

  @Column({ name: 'previous_therapy', type: 'text', nullable: true })
  previousTherapy: string | null;

  @Column({ name: 'family_history', type: 'text', nullable: true })
  familyHistory: string | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via patient_id → eic_patients (see A8 relationship audit).
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => EicPatient, (p) => p.developmentalHistory)
  @JoinColumn({ name: 'patient_id' })
  patient: EicPatient;
}
