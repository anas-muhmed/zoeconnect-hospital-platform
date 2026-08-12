import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { AttendanceRuleSet } from '../attendance.types';

@Entity('attendance_rules')
@Index(['code'], { unique: true })
@Index(['isActive', 'effectiveFrom'])
export class AttendanceRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'code', type: 'varchar', length: 80 })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 160 })
  name: string;

  @Column({ name: 'rules', type: 'jsonb' })
  rules: AttendanceRuleSet;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'effective_from', type: 'date', default: () => 'CURRENT_DATE' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A9) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Ownership
   * classification unresolved (shared-global config vs. tenant-specific
   * rule sets) — see HYBRID_ARCHITECTURE_LOG.md's A9 entry; not decided
   * by this column's presence.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

