import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type CmsCacheStatus = 'OK' | 'SYNCING' | 'ERROR' | 'OFFLINE';

/**
 * CMSDisplayAssignment --- binds a physical/virtual display (identified by
 * a unique slug the Player page is loaded with) to the playlist it should
 * play. One playlist may be assigned to many displays.
 *
 * This is a brand-new display registry for the CMS module -- intentionally
 * NOT the same table as the existing token module's `display_pages`
 * (Custom Display), per the requirement that CMS stay fully independent.
 *
 * Phase 3 (player robustness) adds a set of "last reported health" columns
 * -- a single upserted snapshot per display, written by
 * CmsDisplayService.reportHealth() on every periodic health POST.
 *
 * v1.0 stabilization adds: optional group membership (screen groups), tags
 * (for tag-targeted bulk remote commands), and maintenance-mode fields.
 * Content resolution priority (see CmsDisplayService.getActiveContent) is:
 * Emergency broadcast > Maintenance mode > Schedule > Group playlist >
 * this display's own fallback `playlistId`.
 */
@Entity('cms_display_assignments')
export class CMSDisplayAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  /**
   * Slug used in the public player URL, e.g. /cms/player/<slug>.
   *
   * Production incident fix (2026-08 — "CMS Player is global instead of
   * tenant-scoped"): no longer globally unique on its own -- the real
   * constraint is the composite `(tenantId, slug)` index declared via
   * migration (`synchronize: false` everywhere in this repo, so this
   * entity's decorators are documentation, not schema source of truth;
   * see `1790900000000-TenantScopeCmsDisplayAssignmentSlug.ts`). Two
   * tenants can now both register a display named "main" -- resolution
   * is disambiguated server-side by the requesting hostname's tenant
   * (see `CmsDisplayService.findBySlug()`).
   */
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ type: 'uuid', name: 'playlist_id', nullable: true })
  playlistId: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  /** Last time the Player for this display checked in (heartbeat / health report) */
  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'varchar', name: 'last_seen_ip', length: 45, nullable: true })
  lastSeenIp: string | null;

  // -- Phase 3: last-reported player health snapshot --------------------------

  @Column({ type: 'boolean', name: 'is_player_online', nullable: true })
  isPlayerOnline: boolean | null;

  @Column({ type: 'uuid', name: 'current_playlist_id', nullable: true })
  currentPlaylistId: string | null;

  @Column({ type: 'varchar', name: 'current_item_label', length: 255, nullable: true })
  currentItemLabel: string | null;

  @Column({ type: 'int', name: 'current_version_number', nullable: true })
  currentVersionNumber: number | null;

  @Column({ type: 'timestamptz', name: 'last_sync_at', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'varchar', name: 'cache_status', length: 20, nullable: true })
  cacheStatus: CmsCacheStatus | null;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null;

  @Column({ type: 'bigint', name: 'storage_usage_bytes', nullable: true })
  storageUsageBytes: number | null;

  // -- v1.0: screen groups, tags, maintenance mode -----------------------------

  @Column({ type: 'uuid', name: 'group_id', nullable: true })
  groupId: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ type: 'boolean', name: 'maintenance_mode', default: false })
  maintenanceMode: boolean;

  @Column({ type: 'varchar', name: 'maintenance_message', length: 255, nullable: true })
  maintenanceMessage: string | null;

  /** Set by a remote PAUSE command; cleared by RESUME. The player honors this before playing anything else. */
  @Column({ type: 'boolean', name: 'is_paused', default: false })
  isPaused: boolean;

  // -- Scrolling ticker ---------------------------------------------------------
  // A persistent overlay bar, independent of the playlist rotation -- unlike
  // maintenance/emergency it does not replace what's playing, it scrolls on
  // top of it. Message content lives in CMSTickerMessage rows (many per
  // display, individually schedulable/prioritized/sourced); these columns
  // are purely the screen's ticker style/behavior settings, same pattern as
  // maintenanceMode/maintenanceMessage above.

  @Column({ type: 'boolean', name: 'ticker_enabled', default: false })
  tickerEnabled: boolean;

  /** 'top' or 'bottom' of the screen. */
  @Column({ type: 'varchar', name: 'ticker_position', length: 10, default: 'bottom' })
  tickerPosition: 'top' | 'bottom';

  /** 0.5 (slow) - 10 (fast), same scale as the token module's marquee element. */
  @Column({ type: 'numeric', name: 'ticker_speed', precision: 4, scale: 1, default: 3.0 })
  tickerSpeed: number;

  @Column({ type: 'varchar', name: 'ticker_background_color', length: 20, nullable: true })
  tickerBackgroundColor: string | null;

  @Column({ type: 'varchar', name: 'ticker_text_color', length: 20, nullable: true })
  tickerTextColor: string | null;

  @Column({ type: 'numeric', name: 'ticker_font_size', precision: 4, scale: 2, default: 1.4 })
  tickerFontSize: number;

  /** Inserted between messages/repeats in the scrolling text. */
  @Column({ type: 'varchar', name: 'ticker_separator', length: 50, default: '     •     ' })
  tickerSeparator: string;

  @Column({ type: 'varchar', name: 'created_by', length: 100 })
  createdBy: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — added nullable, backfilled
   * to the seeded 'default' tenant for every existing row
   * (`1783790000000-AddTenantIdToCmsTables.ts`).
   *
   * Production incident fix (2026-08 — "CMS Player is global instead of
   * tenant-scoped"): made `NOT NULL` and combined with `slug` into a
   * composite unique constraint -- see
   * `1790900000000-TenantScopeCmsDisplayAssignmentSlug.ts`, same shape of
   * fix Task 10 already applied to `TokenKiosk.kioskSlug` and
   * `HisSchemaConfig.configKey`. `CmsDisplayService.create()` stamps this
   * via `TenantContextStorage.requireTenantContext()` (fail-fast, never a
   * silent NULL); the public, unauthenticated player routes resolve it
   * from `req.tenantId` (`SubdomainTenantMiddleware`, already run on every
   * request) instead of a session, since a physical player cannot log in.
   */
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
