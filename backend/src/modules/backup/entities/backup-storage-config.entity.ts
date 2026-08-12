import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type BackupStorageDriver = 'local' | 's3' | 'azure' | 'gcs' | 'sftp' | 'network_share';

/** Which kind of backup run this destination may be used for. 'both' (default) means either. */
export type BackupStoragePurpose = 'manual' | 'scheduled' | 'both';

/**
 * BackupStorageConfig — an admin-configured backup destination.
 *
 * Deliberately a distinct table from the generic object-repository's
 * single-global-driver STORAGE_PROVIDER token (see backup module's own doc
 * comment in backup-storage-provider.interface.ts): backup destinations are
 * per-destination, admin-creatable rows (an installation can have "Local
 * disk", "S3 offsite", and "Azure DR" all configured at once), not one
 * process-wide driver selected by an env var.
 *
 * `config` holds only NON-secret driver-specific connection details
 * (bucket/region/host/path/port/keyPrefix, etc.) as plaintext JSONB.
 * Credential-bearing sub-fields (S3 secret key, SFTP password/private key,
 * Azure connection string, ...) are pulled out by BackupCredentialCipherService
 * and stored AES-256-GCM-encrypted in `encryptedCredentials` instead --
 * see that service's doc comment for the full design. This used to be a
 * single plaintext `config` blob (flagged as known debt); that debt is
 * resolved by this split, not by this doc comment alone.
 *
 * Multi-destination / tenant / environment / priority model (see also
 * BackupDestinationResolverService, which is the ONLY place that should
 * implement "which destinations apply to this job" logic):
 *   - `purpose`: restricts a destination to manual-only, scheduled-only, or
 *     both (default).
 *   - `environment`: optional free-text tag ('development'|'uat'|'production'
 *     or any operator-chosen string); null means "applies in every
 *     environment" (the common self-hosted case, which doesn't use this at
 *     all).
 *   - `priority`: lower runs first in `failover` write mode, and is the tie
 *     -breaker when resolving a default among several eligible destinations.
 *   - `shareable`: only meaningful for a platform-level destination
 *     (tenantId IS NULL) in cloud mode. A tenant's backup may resolve to (a)
 *     its OWN tenantId-scoped destinations, or (b) a global destination
 *     ONLY if that destination has shareable=true. A non-shareable global
 *     row, and every other tenant's rows, are never eligible -- this is the
 *     whole tenant-isolation contract for backup storage destinations.
 *
 * Access to this table is gated by BACKUP:SETTINGS, and it is tenant-scoped
 * in cloud mode via TenantScopedRepository exactly like every other row in
 * this module (TenantScopedRepository itself doesn't know about `shareable`
 * -- cross-tenant visibility of a shareable global row is handled
 * explicitly in BackupDestinationResolverService via the raw, non-scoped
 * repository, not by loosening tenant scoping here).
 */
@Entity('backup_storage_configs')
@Index(['tenantId', 'isActive'])
export class BackupStorageConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 30 })
  driver: BackupStorageDriver;

  /** Non-secret driver config only -- see class doc comment. */
  @Column({ type: 'jsonb', default: '{}' })
  config: Record<string, unknown>;

  /** AES-256-GCM-encrypted JSON blob of credential sub-fields (BackupCredentialCipherService). Null if the driver has none configured. */
  @Column({ name: 'encrypted_credentials', type: 'text', nullable: true })
  encryptedCredentials: string | null;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 20, default: 'both' })
  purpose: BackupStoragePurpose;

  @Column({ type: 'varchar', length: 50, nullable: true })
  environment: string | null;

  /** Lower runs first in failover mode; tie-breaker for default resolution. */
  @Column({ type: 'int', default: 100 })
  priority: number;

  /** Only meaningful when tenantId IS NULL -- see class doc comment's tenant-isolation contract. */
  @Column({ default: false })
  shareable: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
