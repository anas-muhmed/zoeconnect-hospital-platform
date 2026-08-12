import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type CmsCommandType = 'REFRESH' | 'RESTART' | 'CLEAR_CACHE' | 'FORCE_SYNC' | 'PAUSE' | 'RESUME';
export type CmsCommandStatus = 'PENDING' | 'ACKNOWLEDGED';

/**
 * CMSDisplayCommand --- a remote-management command queued for a display's
 * player to pick up on its next poll and execute locally (refresh the page,
 * clear its asset cache, force an immediate sync, pause/resume playback).
 * The player acknowledges execution via POST .../commands/:id/ack, which
 * flips status to ACKNOWLEDGED -- rows are never deleted, giving a simple
 * command history per display for free.
 */
@Entity('cms_display_commands')
export class CMSDisplayCommand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'display_assignment_id' })
  displayAssignmentId: string;

  @Column({ type: 'varchar', name: 'command_type', length: 20 })
  commandType: CmsCommandType;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: CmsCommandStatus;

  @Column({ type: 'varchar', name: 'created_by', length: 100 })
  createdBy: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'acknowledged_at', nullable: true })
  acknowledgedAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via display_assignment_id → cms_display_assignments.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;
}
