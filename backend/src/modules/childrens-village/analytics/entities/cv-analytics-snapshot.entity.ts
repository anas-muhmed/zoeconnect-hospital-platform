import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index
} from 'typeorm';

@Entity('cv_analytics_snapshots')
@Index('IDX_CV_SNAPSHOTS_TENANT_DATE', ['tenantId', 'snapshotDate'])
@Index('IDX_CV_SNAPSHOTS_STUDENT', ['tenantId', 'studentId', 'snapshotDate'])
export class CvAnalyticsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate: Date;

  @Column({ name: 'level', type: 'varchar', length: 20 })
  // e.g. STUDENT, CLASS, SYSTEM
  level: string;

  @Column({ name: 'student_id', type: 'uuid', nullable: true })
  studentId: string | null;

  @Column({ name: 'class_id', type: 'uuid', nullable: true })
  classId: string | null;

  @Column({ name: 'metrics', type: 'jsonb' })
  // e.g. { attendancePercent: 95.5, behaviourIncidents: 2, positiveReinforcements: 5, iepGoalsMet: 1 }
  metrics: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
