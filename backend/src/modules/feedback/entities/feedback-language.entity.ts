import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * FeedbackLanguage --- the global list of languages available to translate
 * forms into (BCP-47-ish codes, e.g. 'en', 'ar', 'hi'), independent of any
 * one form. A form's own `language` column (Phase 1) is the language it
 * was *authored* in; this table is the pool of languages an admin can add
 * a *translation* into via FeedbackTranslation. Deliberately global, not
 * per-branch -- hospitals share the same pool of supported languages, they
 * just choose which forms to actually translate.
 */
@Entity('feedback_languages')
export class FeedbackLanguage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Deliberately
   * global today per this entity's own doc comment (hospitals share the
   * same language pool) — Ownership classification: Shared-global, not
   * Tenant-owned. Whether this table should ever get a load-bearing
   * tenant_id in Stage B (vs. remaining permanently global) is an open
   * architectural question, not decided by this column's presence.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
