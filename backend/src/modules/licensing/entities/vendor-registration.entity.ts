import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type VendorRegStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

@Entity('vendor_registrations')
export class VendorRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Issued by vendor platform on successful registration */
  @Column({ name: 'instance_token', type: 'varchar', length: 64, unique: true })
  instanceToken: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A3) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  /** HMAC-SHA256 key for verifying inbound vendor administration requests */
  @Column({ name: 'instance_secret', type: 'varchar', length: 128 })
  instanceSecret: string;

  /** Base URL of the vendor platform API, e.g. http://192.168.1.10:4000 */
  @Column({ name: 'vendor_api_url', type: 'varchar', length: 512 })
  vendorApiUrl: string;

  @Column({ name: 'hospital_name', type: 'varchar', length: 255 })
  hospitalName: string;

  @Column({ name: 'hospital_code', type: 'varchar', length: 64 })
  hospitalCode: string;

  /** Hospital's public IP used by vendor to deliver webhooks */
  @Column({ name: 'public_ip', type: 'varchar', length: 128 })
  publicIp: string;

  /** Port on which ZoeConnect backend is publicly reachable */
  @Column({ name: 'public_port', type: 'int', default: 3000 })
  publicPort: number;

  @Column({ name: 'machine_fingerprint', type: 'varchar', length: 64 })
  machineFingerprint: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'PENDING' })
  status: VendorRegStatus;

  @CreateDateColumn({ name: 'registered_at' })
  registeredAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
