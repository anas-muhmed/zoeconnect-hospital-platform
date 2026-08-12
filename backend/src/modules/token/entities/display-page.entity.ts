import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Unique
} from 'typeorm';

@Entity('display_pages')
@Unique(['tenantId', 'slug'])
export class DisplayPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** URL-safe slug - becomes /display/:slug */
  @Column({ length: 80 })
  slug: string;

  /** Human-readable title shown in the management UI */
  @Column({ length: 120, default: '' })
  title: string;

  /** Full canvas layout JSON (same shape as token_display_config) */
  @Column({ type: 'jsonb', default: {} })
  layout: Record<string, unknown>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /**
   * FK to users.id stored as a plain column.
   *
   * Previously this entity had both @ManyToOne+@JoinColumn({ name: 'created_by' })
   * AND @Column({ name: 'created_by' }) pointing at the same database column.
   * TypeORM 0.3.x emits two ColumnMetadata entries for that DB column, which
   * prevents the repository from initialising and causes DisplayController
   * routes to silently disappear from Fastify's router (returning 404).
   *
   * Fix: drop the @ManyToOne relation entirely.  The relation is never eagerly
   * loaded anywhere in the codebase; the DB-level FK constraint in the
   * CreateDisplayPages migration still enforces referential integrity.
   */
  @Column({ name: 'created_by', nullable: true, type: 'text' })
  createdById: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) originally added this
   * column nullable, with tenant-ownership left as an open question.
   *
   * Resolved by migration `1790900000001-TenantScopeTokenDisplaySlug`
   * (2026-08): every row was backfilled to a real tenant (NULL rows were
   * assigned to the seeded `default` tenant), the column was altered to
   * `NOT NULL`, and the old global-unique `slug` constraint was replaced
   * with a composite `UNIQUE (tenant_id, slug)` -- see this class's
   * `@Unique(['tenantId', 'slug'])` decorator below, which was already
   * correct; only this column's nullability was still describing the
   * pre-migration schema. `DisplayService.create()` enforces this at the
   * application layer too, via `tenantContext.requireTenantContext()`
   * (fails fast rather than ever writing NULL again).
   *
   * Note: rows backfilled to `default` by the migration may not reflect
   * their true original owning tenant -- that's a data-quality question
   * tracked separately, not something this column's type can express.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: false })
  tenantId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
