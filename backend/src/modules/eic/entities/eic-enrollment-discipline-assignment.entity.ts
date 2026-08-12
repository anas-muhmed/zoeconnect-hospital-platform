import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { EicTherapyEnrollment } from './eic-therapy-enrollment.entity';
import { EicDiscipline } from '../common/enums/discipline.enum';

export enum AssignmentRole {
  PRIMARY    = 'PRIMARY',
  COVERING   = 'COVERING',
  SUPERVISOR = 'SUPERVISOR',
}

@Entity('eic_enrollment_discipline_assignments')
export class EicEnrollmentDisciplineAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ name: 'discipline', type: 'enum', enum: EicDiscipline })
  discipline: EicDiscipline;

  /** Live reference — no name snapshot. User records get status: INACTIVE instead of deletion. */
  @Column({ name: 'therapist_id', type: 'uuid' })
  therapistId: string;

  @Column({ name: 'role', type: 'enum', enum: AssignmentRole, default: AssignmentRole.PRIMARY })
  role: AssignmentRole;

  @Column({ name: 'assignment_reason', type: 'varchar', length: 500, nullable: true })
  assignmentReason: string | null;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  /** null = currently active */
  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Who created this assignment record */
  @Column({ name: 'assigned_by', type: 'uuid' })
  assignedBy: string;

  /** Monotonic counter — incremented on every reassignment for the same enrollment+discipline+role */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version: number;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via enrollment_id → eic_therapy_enrollments → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => EicTherapyEnrollment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment: EicTherapyEnrollment;
}
