import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { TokenKioskAssignment } from './token-kiosk-assignment.entity';

export type KioskType = 'MULTIPLE' | 'SINGLE' | 'DISPLAY_ONLY';

/**
 * TokenKiosk --- permanent kiosk registry entry.
 *
 * kiosk_slug is a base-32 8-character identifier (e.g. ABCD1234) that
 * never changes. The URL /kiosk/{slug} is permanent.
 *
 * Types:
 *   MULTIPLE --- one assignment, goes straight to token print screen
 *   SINGLE   --- multiple assignments, shows selection first
 *   DISPLAY_ONLY --- read-only display (no token issuance)
 */
@Entity('token_kiosks')
export class TokenKiosk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', length: 30 })
  branchId: string;

  /**
   * Permanent, human-readable URL slug. Never changes after creation.
   * Tenant-Scoped User Identity, Task 10: no longer globally unique on its
   * own -- the real constraint is the composite `(tenantId, kioskSlug)`
   * index declared via migration (`synchronize: false` everywhere in this
   * repo, so this entity's decorators are documentation, not schema
   * source of truth; see `1783890000000-Task10TenantScopedUniqueConstraints.ts`).
   */
  @Column({ name: 'kiosk_slug', length: 12 })
  kioskSlug: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'kiosk_type', length: 20, default: 'MULTIPLE' })
  kioskType: KioskType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Column({ type: 'varchar', name: 'archived_by', length: 100, nullable: true })
  archivedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'varchar', name: 'created_by', length: 100, nullable: true })
  createdBy: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — stamped by
   * `TokenKioskService.createKiosk()` via
   * `TenantContextStorage.currentTenantIdOrNull()` since Stage B. Admin CRUD
   * is session-derived; the public kiosk read/issue path is anonymous and
   * derives tenant server-side from this kiosk's `branchId` instead (same
   * shape as A12's public chain-derived pattern).
   *
   * Tenant-Scoped User Identity, Task 10: made `NOT NULL` and `kioskSlug`'s
   * unique constraint widened to a composite `(tenantId, kioskSlug)` — see
   * `1783890000000-Task10TenantScopedUniqueConstraints.ts`. `kioskSlug` was
   * a genuine tenant-scoped-identity gap (same shape as `username` before
   * Task 5): two tenants could plausibly both want a slug like `MAIN01`.
   */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @OneToMany(() => TokenKioskAssignment, (a) => a.kiosk, { cascade: true })
  assignments: TokenKioskAssignment[];
}
