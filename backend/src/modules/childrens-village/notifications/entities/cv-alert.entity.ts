import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';

@Entity('cv_alerts')
@Index('IDX_CV_ALERTS_TENANT', ['tenantId'])
@Index('IDX_CV_ALERTS_STUDENT', ['tenantId', 'studentId'])
@Index('IDX_CV_ALERTS_STATUS', ['tenantId', 'status'])
export class CvAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'student_id', type: 'uuid', nullable: true })
  studentId: string | null;

  @Column({ name: 'type', type: 'varchar', length: 50 })
  // e.g. IEP_REVIEW_DUE, ATTENDANCE_DROP, BEHAVIOUR_ESCALATION, CURRICULUM_BEHIND
  type: string;

  @Column({ name: 'severity', type: 'varchar', length: 20 })
  // e.g. LOW, MEDIUM, HIGH, CRITICAL
  severity: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ACTIVE' })
  // e.g. ACTIVE, ACKNOWLEDGED, RESOLVED, DISMISSED, ESCALATED
  status: string;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ name: 'actioned_by', type: 'uuid', nullable: true })
  actionedBy: string | null;

  @Column({ name: 'actioned_at', type: 'timestamp', nullable: true })
  actionedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
