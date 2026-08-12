import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index
} from 'typeorm';

@Entity('cv_event_timeline')
@Index('IDX_CV_TIMELINE_TENANT', ['tenantId'])
@Index('IDX_CV_TIMELINE_STUDENT', ['tenantId', 'studentId'])
export class CvEventTimeline {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'student_id', type: 'uuid', nullable: true })
  studentId: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  // e.g. IEP_APPROVED, DLR_SUBMITTED, ATTENDANCE_ABSENT, BEHAVIOUR_INCIDENT
  eventType: string;

  @Column({ name: 'event_date', type: 'timestamp' })
  eventDate: Date;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'payload', type: 'jsonb' })
  // Context for AI: what exactly happened
  payload: Record<string, any>;

  @Column({ name: 'source_entity_id', type: 'uuid', nullable: true })
  sourceEntityId: string | null;

  @Column({ name: 'source_entity_type', type: 'varchar', length: 50, nullable: true })
  sourceEntityType: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
