import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * CMSDisplayGroup --- a named collection of displays (e.g. "Reception TVs")
 * that share a single playlist assignment. A display's group playlist sits
 * between its schedule resolution and its own plain fallback playlist in
 * the priority chain -- see CmsDisplayService.getActiveContent().
 */
@Entity('cms_display_groups')
export class CMSDisplayGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'uuid', name: 'playlist_id', nullable: true })
  playlistId: string | null;

  @Column({ type: 'varchar', name: 'created_by', length: 100 })
  createdBy: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
