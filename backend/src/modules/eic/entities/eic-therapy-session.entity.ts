import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { EicTherapyEnrollment } from './eic-therapy-enrollment.entity';
import { EicSessionEntry } from './eic-session-entry.entity';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { EicSessionStatus } from '../common/enums/assessment-status.enum';

@Entity('eic_therapy_sessions')
export class EicTherapySession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ name: 'discipline', type: 'enum', enum: EicDiscipline })
  discipline: EicDiscipline;

  @Column({ name: 'session_date', type: 'date' })
  sessionDate: string;

  @Column({ name: 'session_number', type: 'int', nullable: true })
  sessionNumber: number | null;

  @Column({ name: 'therapist_id', type: 'varchar', length: 100 })
  therapistId: string;

  @Column({ name: 'therapist_name', type: 'varchar', length: 200 })
  therapistName: string;

  @Column({ name: 'duration_minutes', type: 'smallint', nullable: true })
  durationMinutes: number | null;

  @Column({ name: 'attendance', type: 'varchar', length: 20, default: 'PRESENT' })
  attendance: string;

  @Column({ name: 'session_remarks', type: 'text', nullable: true })
  sessionRemarks: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EicSessionStatus,
    default: EicSessionStatus.DRAFT,
  })
  status: EicSessionStatus;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Highest-volume
   * table in the module (daily/weekly cadence); tenant is derivable via
   * enrollment_id → eic_therapy_enrollments → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => EicTherapyEnrollment, (e) => e.sessions)
  @JoinColumn({ name: 'enrollment_id' })
  enrollment: EicTherapyEnrollment;

  @OneToMany(() => EicSessionEntry, (se) => se.session)
  entries: EicSessionEntry[];
}
