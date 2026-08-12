import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * A registered Kiosk Desktop (Electron) till, minted from a KioskPairing
 * on successful activation -- mirrors ConnectorInstance
 * (../connector/entities/connector-instance.entity.ts). `kioskUrl` is
 * copied from the pairing at registration time (not re-read from it on
 * every request) so revoking/reusing a pairing later can never change
 * which page an already-activated till loads.
 *
 * `status`:
 *  - 'registered': activated, hasn't sent a heartbeat yet
 *  - 'online':     heartbeat received within the last 90s
 *  - 'offline':    heartbeat received before, but not within 90s (computed
 *                   at read time from lastHeartbeatAt, not stored as a
 *                   push-based transition -- see KioskDeviceService)
 *  - 'disabled':   admin-disabled; heartbeats/print-config calls should be
 *                   rejected and the till should show its "disabled" screen
 *  - 'revoked':    permanently deactivated, same rejection as 'disabled'
 *                   but not expected to be re-enabled
 */
export type KioskDeviceStatus = 'registered' | 'online' | 'offline' | 'disabled' | 'revoked';

@Entity('kiosk_devices')
@Index('idx_kiosk_devices_tenant', ['tenantId'])
export class KioskDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'pairing_id', type: 'uuid' })
  pairingId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @Column({ name: 'kiosk_url', type: 'varchar', length: 500 })
  kioskUrl: string;

  @Column({ type: 'varchar', length: 20, default: 'registered' })
  status: KioskDeviceStatus;

  @Column({ name: 'app_version', type: 'varchar', length: 40, nullable: true })
  appVersion: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hostname: string | null;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
  disabledAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
