import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvEvent } from './cv-event.entity';

@Entity('cv_event_participants')
@Index('IDX_CV_EVENT_PARTS_TENANT', ['tenantId'])
export class CvEventParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'participant_type', type: 'varchar', length: 50 })
  // e.g. STUDENT, CLASS, TEACHER, GUARDIAN
  participantType: string;

  @Column({ name: 'participant_id', type: 'uuid' })
  participantId: string;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'INVITED' })
  // e.g. INVITED, CONFIRMED, ATTENDED, CANCELLED
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => CvEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: CvEvent;
}
