import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { EicTherapySession } from './eic-therapy-session.entity';
import { EicGoal } from './eic-goal.entity';

@Entity('eic_session_entries')
export class EicSessionEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'goal_id', type: 'uuid', nullable: true })
  goalId: string | null;

  @Column({ name: 'goal_text', type: 'text' })
  goalText: string;

  @Column({ name: 'activity', type: 'text' })
  activity: string;

  @Column({ name: 'child_response', type: 'text' })
  childResponse: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder: number;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Highest-volume
   * table in the module (multiple entries per session); tenant is
   * derivable via session_id → eic_therapy_sessions → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => EicTherapySession, (s) => s.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: EicTherapySession;

  @ManyToOne(() => EicGoal, (g) => g.sessionEntries, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'goal_id' })
  goal: EicGoal | null;
}
