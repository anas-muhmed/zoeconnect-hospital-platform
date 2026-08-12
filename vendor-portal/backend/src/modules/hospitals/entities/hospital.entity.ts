import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { LicenseRequest } from './license-request.entity';
import { IssuedLicense }  from './issued-license.entity';
import { RevocationEvent } from './revocation-event.entity';

export type HospitalStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type HospitalDeploymentType = 'self_hosted' | 'cloud';

@Entity('hospitals')
export class Hospital {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Customers merge (Phase 2, 2026-07-20): distinguishes a self-hosted
  // "hospital" (paired via instance_token, reachable at publicIp:publicPort)
  // from a cloud tenant (provisioned via CloudTenantsService, no physical
  // instance to pair with -- see cloudTenantId below). Default preserves
  // every existing row's real meaning: they were all self-hosted before
  // this column existed.
  @Column({ name: 'deployment_type', type: 'varchar', length: 16, default: 'self_hosted' })
  deploymentType: HospitalDeploymentType;

  // Customers merge (Phase 2) -- back-reference to cloud_tenants.id for
  // cloud rows (set once by CloudTenantsService.provision() on success).
  // Null for every self-hosted row. Not a DB-level FK: cloud_tenants and
  // hospitals are independent tables with no ON DELETE relationship defined
  // between them, and this column exists purely for cross-reference/lookup.
  @Column({ name: 'cloud_tenant_id', type: 'uuid', nullable: true })
  cloudTenantId: string | null;

  // Self-hosted-only fields below. All now nullable (Phase 2 migration
  // 1785700000000-CustomersMerge.ts) -- a cloud row has no physical instance
  // to pair with, no public IP/port to reach, and no per-instance webhook
  // to push to (see HospitalsService's cloud guards on the push/sync/test
  // methods that depend on these). Self-hosted rows are completely
  // unaffected: `register()` still always supplies every one of these.
  @Column({ name: 'instance_token', type: 'varchar', length: 64, unique: true, nullable: true })
  instanceToken: string | null;

  @Column({ name: 'instance_secret', type: 'varchar', length: 128, nullable: true })
  instanceSecret: string | null;

  @Column({ name: 'hospital_name', type: 'varchar', length: 255 })
  hospitalName: string;

  @Column({ name: 'hospital_code', type: 'varchar', length: 64, unique: true })
  hospitalCode: string;

  @Column({ name: 'public_ip', type: 'varchar', length: 128, nullable: true })
  publicIp: string | null;

  @Column({ name: 'public_port', type: 'int', default: 3000, nullable: true })
  publicPort: number | null;

  @Column({ name: 'webhook_url', type: 'varchar', length: 512, nullable: true })
  webhookUrl: string | null;

  @Column({ name: 'machine_fingerprint', type: 'varchar', length: 64, nullable: true })
  machineFingerprint: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: HospitalStatus;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'last_webhook_at', type: 'timestamptz', nullable: true })
  lastWebhookAt: Date | null;

  @Column({ name: 'last_webhook_status', type: 'varchar', length: 32, nullable: true })
  lastWebhookStatus: 'OK' | 'FAILED' | null;

  @CreateDateColumn({ name: 'registered_at' })
  registeredAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => LicenseRequest, (r) => r.hospital)
  requests: LicenseRequest[];

  @OneToMany(() => IssuedLicense, (l) => l.hospital)
  licenses: IssuedLicense[];

  @OneToMany(() => RevocationEvent, (e) => e.hospital)
  revocations: RevocationEvent[];
}
