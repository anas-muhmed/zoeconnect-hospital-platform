import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export type ConnectorInstanceStatus = 'registered' | 'online' | 'offline' | 'revoked';

/**
 * ConnectorInstance (ZoeConnect Connector, Phase A — 2026-07-21, see
 * HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md §4/§11 and
 * HDSP_CONNECTOR_CURRENT_STATE_AUDIT.md's "biggest missing piece").
 *
 * The row that finally gives a Connector process an identity: created the
 * moment a `TenantConnectorPairing`'s one-time key is successfully
 * redeemed via `POST /connector/register` (`ConnectorRegistrationService`).
 * From that point on, every connector token issued for this tenant is
 * scoped to this specific `id`, not just "some connector that knew the
 * tenant's pairing key at some point" — closing exactly the gap both
 * architecture documents flagged: today, nothing distinguishes "Hospital
 * A's connector" from "Hospital B's connector" once a message reaches the
 * shared transport.
 *
 * `status` starts at 'registered' (has an identity, has not yet completed
 * a live protocol handshake — Phase B, not built yet) and is intentionally
 * NOT set to 'online' by this phase's code; `online`/`offline` are
 * reserved for the heartbeat/WebSocket-gateway work in a later phase
 * (§6/Phase C of the architecture doc). `revoked` is set by an explicit
 * admin action (not built yet either) or cascaded when the owning
 * `TenantConnectorPairing` itself is revoked (see that entity's
 * `revokedAt` — tenant de-provisioning already revokes pairings today,
 * per `TenantProvisioningService.deprovision()`; cascading that to any
 * already-registered `ConnectorInstance` rows is a follow-up, not done in
 * this pass, and is flagged rather than silently assumed).
 *
 * One tenant can in principle register more than one `ConnectorInstance`
 * (e.g. re-pairing after losing local credentials leaves the old row
 * orphaned rather than reused) — this entity does not enforce
 * one-per-tenant. Fleet-management UI to surface/clean up stale rows is
 * explicitly out of scope for Phase A (see the architecture doc's Phase C).
 */
@Entity('connector_instances')
@Index('idx_connector_instances_tenant', ['tenantId'])
export class ConnectorInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** The one-time pairing credential this instance was registered from. */
  @Column({ name: 'pairing_id', type: 'uuid' })
  pairingId: string;

  @Column({ type: 'varchar', length: 20, default: 'registered' })
  status: ConnectorInstanceStatus;

  /** Self-reported connector package version (e.g. from connector/package.json). Null until first heartbeat -- not sent at registration time. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  version: string | null;

  /** Informational only, self-reported by the connector -- never trusted for authorization decisions. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  hostname: string | null;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
