import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvStudent } from '../../students/entities/cv-student.entity';

@Entity('cv_parent_diaries')
@Index('IDX_CV_PARENT_DIARIES_TENANT', ['tenantId', 'studentId', 'createdAt'])
export class CvParentDiary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @ManyToOne(() => CvStudent)
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;

  @Column({ name: 'sender_type', type: 'varchar', length: 50 }) // TEACHER, THERAPIST, PARENT, SYSTEM
  senderType: string;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @Column({ name: 'receiver_type', type: 'varchar', length: 50 }) // PARENT, TEACHER, THERAPIST
  receiverType: string;

  @Column({ name: 'message_type', type: 'varchar', length: 50, default: 'MESSAGE' }) // MESSAGE, ANNOUNCEMENT, ALERT
  messageType: string;

  @Column({ name: 'content', type: 'text' })
  content: string;

  @Column({ name: 'has_attachments', type: 'boolean', default: false })
  hasAttachments: boolean;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt: Date | null;

  @Column({ name: 'replies_enabled', type: 'boolean', default: false })
  repliesEnabled: boolean; // Set to false for Phase 5

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
