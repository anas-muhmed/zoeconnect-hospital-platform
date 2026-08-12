import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A single-use activation code for a Kiosk Desktop (Electron) till,
 * mirroring TenantConnectorPairing
 * (../tenant-provisioning/entities/tenant-connector-pairing.entity.ts) --
 * see that file's doc comment for the general shape this is modeled on.
 * The one addition over the Connector's pairing row is `kioskUrl`/`label`:
 * an admin sets, at code-generation time, which kiosk page this specific
 * till should show once activated (e.g. a specific branch's
 * /token/print-kiosk?branchId=...), so hospital IT never has to type or
 * paste a URL on the kiosk machine itself -- only the short activation
 * code from KioskRegistrationService.register().
 */
export type KioskPairingStatus = 'pending' | 'active' | 'revoked';

@Entity('kiosk_pairings')
export class KioskPairing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'activation_code_hash', type: 'varchar', length: 255 })
  activationCodeHash: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @Column({ name: 'kiosk_url', type: 'varchar', length: 500 })
  kioskUrl: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: KioskPairingStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
}
