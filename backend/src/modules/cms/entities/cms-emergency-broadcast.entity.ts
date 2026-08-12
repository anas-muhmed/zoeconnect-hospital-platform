import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * CMSEmergencyBroadcast --- an override that forces every display (branch-
 * scoped, or all displays if branchId is null) to immediately show a given
 * playlist (e.g. "Fire Evacuation", "Code Blue"), regardless of schedules,
 * groups, or fallback assignments -- the single highest-priority item in
 * CmsDisplayService.getActiveContent()'s resolution chain. Only one row may
 * be active at a time per branch scope (enforced in CmsEmergencyService,
 * not at the DB level, to keep the table append-only for audit history).
 */
@Entity('cms_emergency_broadcasts')
export class CMSEmergencyBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null = applies to every display regardless of branch */
  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'uuid', name: 'playlist_id' })
  playlistId: string;

  @Column({ type: 'varchar', length: 200 })
  message: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', name: 'activated_by', length: 100 })
  activatedBy: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'activated_at' })
  activatedAt: Date;

  @Column({ type: 'varchar', name: 'deactivated_by', length: 100, nullable: true })
  deactivatedBy: string | null;

  @Column({ type: 'timestamptz', name: 'deactivated_at', nullable: true })
  deactivatedAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). `branchId = null`
   * is a legitimate "applies to every display" sentinel, not an
   * unmigrated row — whether `tenant_id = null` should retain that same
   * global-broadcast semantic is an open Stage B design decision, not
   * resolved by this column's presence (see
   * HYBRID_ARCHITECTURE_LOG.md's A11 entry).
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;
}
