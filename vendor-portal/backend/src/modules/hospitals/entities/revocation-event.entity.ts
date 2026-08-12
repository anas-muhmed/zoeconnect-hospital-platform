import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Hospital } from './hospital.entity';

export type RevocationType  = 'FULL' | 'MODULE';
export type WebhookDelivery = 'PENDING' | 'DELIVERED' | 'FAILED';

@Entity('revocation_events')
export class RevocationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Hospital, (h) => h.revocations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hospital_id' })
  hospital: Hospital;

  @Column({ name: 'hospital_id', type: 'uuid' })
  hospitalId: string;

  @Column({ name: 'revocation_type', type: 'varchar', length: 16 })
  revocationType: RevocationType;

  @Column({ name: 'modules', type: 'jsonb', nullable: true })
  modules: string[] | null;

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({ name: 'force_logout', type: 'boolean', default: false })
  forceLogout: boolean;

  @Column({ name: 'revoked_by', type: 'uuid' })
  revokedBy: string;

  @Column({ name: 'acknowledged', type: 'boolean', default: false })
  acknowledged: boolean;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ name: 'webhook_status', type: 'varchar', length: 16, default: 'PENDING' })
  webhookStatus: WebhookDelivery;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
