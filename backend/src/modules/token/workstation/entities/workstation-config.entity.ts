import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * WorkstationConfig
 *
 * Binds a physical reception workstation (identified by a UUID the browser
 * generates once and keeps in localStorage) to a fixed queue context:
 * branch + location (which, per TokenLocation, already carries both a
 * department and a service-center label) + counter.
 *
 * This is the entire "identity" the ZoeConnect Token Selector popup needs. It is
 * deliberately NOT tied to a human user or a HIS login — the workstation
 * doesn't move between shifts even when the receptionist sitting at it
 * does, so the queue context shouldn't move either. See
 * docs/his-integration/POPUP_INTEGRATION_ARCHITECTURE.md, "Workstation-based
 * context resolution" section, for the full rationale.
 *
 * `workstationId` is client-generated (crypto.randomUUID() in the popup,
 * stored in localStorage under HDSP_WORKSTATION_ID) — ZoeConnect trusts it only
 * as an opaque correlation key, never as a credential. The row it points to
 * is the actual source of truth (branch/location/counter), stored
 * server-side specifically so that clearing browser storage loses only the
 * (regenerable) pointer, never the configuration itself.
 */
@Entity('hdsp_workstation_configuration')
export class WorkstationConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'workstation_id', type: 'uuid' })
  workstationId: string;

  @Column({ name: 'branch_id', type: 'varchar', length: 30 })
  branchId: string;

  /** TokenLocation.id -- carries department + service-center labels already */
  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  /** TokenCounter.id under that location */
  @Column({ name: 'counter_id', type: 'uuid' })
  counterId: string;

  /**
   * When true, POST /token/workstation/:workstationId (the anonymous,
   * walk-up "Change Configuration" path) is refused -- only
   * POST /token/workstation/:workstationId/override (a normal,
   * permission-guarded ZoeConnect session) can reconfigure it. Off by default:
   * the first-run flow requires no login by design, and most sites won't
   * need this. Purely an optional hardening step a supervisor can enable
   * per workstation.
   */
  @Column({ default: false })
  locked: boolean;

  /**
   * Free-text label for who last (re)configured this workstation --
   * 'walk-up' for the anonymous path, or the actual ZoeConnect username for a
   * supervisor override. Audit convenience only, not an access-control
   * value.
   */
  @Column({ name: 'configured_by', type: 'varchar', length: 100, nullable: true })
  configuredBy: string | null;

  @Column({ name: 'configured_at', type: 'timestamptz' })
  configuredAt: Date;

  /** Updated on every popup bootstrap call -- lets an admin see stale/unused workstations. */
  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Configured via
   * the anonymous walk-up POST path (no session) — Stage B must derive
   * tenant_id server-side from this workstation's branchId, never from
   * client input, same chain-derived pattern as TokenRecord/TokenKiosk.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
