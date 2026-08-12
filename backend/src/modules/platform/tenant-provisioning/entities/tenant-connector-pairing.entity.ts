import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export type ConnectorPairingStatus = 'pending' | 'active' | 'revoked';

/**
 * TenantConnectorPairing (Phase 10, Task 10.4 / spec Section 8.1 step 7).
 *
 * Stores a bcrypt HASH of the pairing credential only, mirroring password
 * storage conventions elsewhere in this codebase -- the raw code is
 * returned to the caller exactly once (either the initial provisioning
 * response, or a later regenerate call -- see
 * `TenantProvisioningService.regenerateConnectorActivationCode()`), and is
 * never persisted in plaintext or logged.
 *
 * Consumed by `ConnectorRegistrationService.register()` (ZoeConnect Connector,
 * Phase A) -- a candidate scan (bcrypt.compare against every `pending`,
 * non-expired row) rather than a fast lookup, since only the hash is
 * stored. `status` transitions `pending` -> `active` the moment a
 * Connector successfully redeems a row; `revoked` is used both for
 * superseded rows (see the regenerate flow below) and reserved for a
 * future explicit admin-revoke action (not built yet).
 *
 * D.6 ("Onboarding UX," 2026-07-22) -- reframed as a human-typeable
 * "Activation Code" (`XXXX-XXXX-XXXX` from a safe, ambiguity-free
 * alphabet) rather than the original 43-character opaque base64url token,
 * plus an `expiresAt` window (short-typeable codes need a validity window
 * they didn't when they were 32 random bytes) and an on-demand regenerate
 * path (previously: generate-once-during-provisioning, no rotation).
 */
@Entity('tenant_connector_pairings')
export class TenantConnectorPairing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'pairing_key_hash', type: 'varchar', length: 255 })
  pairingKeyHash: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ConnectorPairingStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /**
   * D.6: nullable for backward compatibility with any pre-existing row
   * (treated as "never expires" -- matches the original design's implicit
   * behavior before this column existed). Every NEWLY generated code
   * (initial provisioning or regenerate) always sets this -- see
   * `ACTIVATION_CODE_TTL_MS` in `tenant-provisioning.service.ts`.
   */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
}
