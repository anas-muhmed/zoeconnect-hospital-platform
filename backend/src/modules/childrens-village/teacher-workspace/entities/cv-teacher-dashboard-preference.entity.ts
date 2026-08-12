import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';

@Entity('cv_teacher_dashboard_preferences')
@Index('IDX_CV_TEACHER_PREFS', ['tenantId', 'teacherId'], { unique: true })
export class CvTeacherDashboardPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string;

  @Column({ name: 'layout_config', type: 'jsonb', nullable: true })
  layoutConfig: any; // UI layout preferences (e.g. collapsed panels)

  @Column({ name: 'theme', type: 'varchar', length: 50, default: 'LIGHT' })
  theme: string;

  @Column({ name: 'notification_preferences', type: 'jsonb', nullable: true })
  notificationPreferences: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
