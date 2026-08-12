import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BackupStorageConfig } from '../entities/backup-storage-config.entity';
import { BackupJob } from '../entities/backup-job.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { BackupCredentialCipherService } from './backup-credential-cipher.service';
import { BackupStorageProviderFactory } from '../providers/backup-storage-provider.factory';
import { AuditService } from '../../audit/audit.service';
import type { CreateStorageProviderDto, UpdateStorageProviderDto } from '../dto/create-storage-provider.dto';
import type {
  BackupStorageCapacity, BackupStorageTestConnectionResult,
} from '../providers/backup-storage-provider.interface';

/** Row shape returned to API clients -- encryptedCredentials is never exposed; a `hasCredentials` boolean stands in for it. */
export interface BackupStorageConfigView extends Omit<BackupStorageConfig, 'encryptedCredentials'> {
  hasCredentials: boolean;
}

/**
 * BackupStorageConfigService — CRUD for backup storage destinations, with
 * BackupCredentialCipherService's encrypt-at-rest split (item 10) applied
 * transparently: callers (BackupController) never see or set
 * `encryptedCredentials` directly, and this service never returns decrypted
 * credentials in an API response (`toView()` strips them entirely).
 */
@Injectable()
export class BackupStorageConfigService {
  constructor(
    @InjectRepository(BackupStorageConfig) private readonly rawRepo: Repository<BackupStorageConfig>,
    @InjectRepository(BackupJob) private readonly rawBackupJobRepo: Repository<BackupJob>,
    @Inject(getTenantScopedRepositoryToken(BackupStorageConfig)) private readonly repo: TenantScopedRepository<BackupStorageConfig>,
    private readonly tenantContext: TenantContextStorage,
    private readonly credentialCipher: BackupCredentialCipherService,
    private readonly storageProviderFactory: BackupStorageProviderFactory,
    private readonly auditService: AuditService,
  ) {}

  private toView(row: BackupStorageConfig): BackupStorageConfigView {
    const { encryptedCredentials, ...rest } = row;
    return { ...rest, hasCredentials: !!encryptedCredentials } as BackupStorageConfigView;
  }

  async findAll(): Promise<BackupStorageConfigView[]> {
    const rows = await this.repo.find({ order: { priority: 'ASC', createdAt: 'DESC' } });
    return rows.map((r) => this.toView(r));
  }

  async findOneRaw(id: string): Promise<BackupStorageConfig> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Backup storage destination ${id} not found`);
    return row;
  }

  async findOne(id: string): Promise<BackupStorageConfigView> {
    return this.toView(await this.findOneRaw(id));
  }

  async create(dto: CreateStorageProviderDto, actorId: string): Promise<BackupStorageConfigView> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const { nonSecretConfig, credentials } = this.credentialCipher.splitConfig(dto.driver, dto.config ?? {});
    const entity = this.rawRepo.create({
      tenantId,
      name: dto.name,
      driver: dto.driver,
      config: nonSecretConfig,
      encryptedCredentials: this.credentialCipher.encrypt(credentials),
      isDefault: dto.isDefault ?? false,
      isActive: true,
      purpose: dto.purpose ?? 'both',
      environment: dto.environment ?? null,
      priority: dto.priority ?? 100,
      shareable: dto.shareable ?? false,
      createdById: actorId,
    });
    if (entity.isDefault) await this.clearOtherDefaults(tenantId, undefined);
    const saved = await this.rawRepo.save(entity);
    await this.auditService.log({
      action: 'BACKUP_STORAGE_DESTINATION_CREATED', module: 'BACKUP', entityType: 'backup_storage_config', entityId: saved.id,
      userId: actorId, metadata: { driver: saved.driver, purpose: saved.purpose, environment: saved.environment },
    });
    return this.toView(saved);
  }

  async update(id: string, dto: UpdateStorageProviderDto): Promise<BackupStorageConfigView> {
    const existing = await this.findOneRaw(id);
    let config = existing.config;
    let encryptedCredentials = existing.encryptedCredentials;
    if (dto.config !== undefined) {
      const { nonSecretConfig, credentials } = this.credentialCipher.splitConfig(existing.driver, dto.config);
      config = nonSecretConfig;
      // Re-encrypt only if new credential fields were actually submitted;
      // an admin editing just the bucket name shouldn't have to re-type secrets.
      encryptedCredentials = Object.keys(credentials).length > 0 ? this.credentialCipher.encrypt(credentials) : existing.encryptedCredentials;
    }
    if (dto.isDefault) await this.clearOtherDefaults(existing.tenantId, id);
    // Cast to `any` here: TypeORM's `QueryDeepPartialEntity<T>` mapped type
    // doesn't resolve cleanly against a `Record<string, unknown>`-typed jsonb
    // column (`config`) -- it demands either a function or a
    // `_QueryDeepPartialEntity<Record<string, unknown>>`, which a plain
    // object literal with an index-signature target type doesn't structurally
    // satisfy even though it's valid at runtime (this is a known TypeORM
    // typing gap with index-signature column types, not a real type error).
    await this.rawRepo.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      config,
      encryptedCredentials,
      ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.purpose !== undefined && { purpose: dto.purpose }),
      ...(dto.environment !== undefined && { environment: dto.environment }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
      ...(dto.shareable !== undefined && { shareable: dto.shareable }),
    } as unknown as Parameters<typeof this.rawRepo.update>[1]);
    const updated = await this.findOneRaw(id);
    await this.auditService.log({
      action: 'BACKUP_STORAGE_DESTINATION_UPDATED', module: 'BACKUP', entityType: 'backup_storage_config', entityId: id,
      metadata: { changedFields: Object.keys(dto) },
    });
    return this.toView(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findOneRaw(id); // 404s if missing/out of tenant scope
    await this.repo.delete({ id });
    await this.auditService.log({ action: 'BACKUP_STORAGE_DESTINATION_DELETED', module: 'BACKUP', entityType: 'backup_storage_config', entityId: id });
  }

  async setDefault(id: string): Promise<BackupStorageConfigView> {
    const existing = await this.findOneRaw(id);
    await this.clearOtherDefaults(existing.tenantId, id);
    await this.rawRepo.update(id, { isDefault: true });
    await this.auditService.log({ action: 'BACKUP_STORAGE_DESTINATION_SET_DEFAULT', module: 'BACKUP', entityType: 'backup_storage_config', entityId: id });
    return this.findOne(id);
  }

  private async clearOtherDefaults(tenantId: string | null, exceptId?: string): Promise<void> {
    const qb = this.rawRepo.createQueryBuilder().update(BackupStorageConfig).set({ isDefault: false });
    qb.where(tenantId ? 'tenant_id = :tenantId' : 'tenant_id IS NULL', { tenantId });
    if (exceptId) qb.andWhere('id != :exceptId', { exceptId });
    await qb.execute();
  }

  // ── Test connection / capacity (points 6 & 7) ───────────────────────────

  async testConnection(id: string, actorId?: string): Promise<BackupStorageTestConnectionResult> {
    const row = await this.findOneRaw(id);
    const provider = this.storageProviderFactory.forStorageConfig(row);
    const result = await provider.testConnection();
    // Audit the fact a test was run and its result -- never the credentials.
    await this.auditService.log({
      action: 'BACKUP_STORAGE_DESTINATION_TEST_CONNECTION', module: 'BACKUP', entityType: 'backup_storage_config', entityId: id,
      userId: actorId, metadata: { ok: result.ok, message: result.message },
    });
    return result;
  }

  /** Tests an unsaved config (POST .../test-connection with a DTO body) -- no persistence, no credential encryption, nothing written. */
  async testConnectionUnsaved(driver: string, config: Record<string, unknown>, actorId?: string): Promise<BackupStorageTestConnectionResult> {
    const provider = this.storageProviderFactory.forDriver(driver, config);
    const result = await provider.testConnection();
    await this.auditService.log({
      action: 'BACKUP_STORAGE_DESTINATION_TEST_CONNECTION_UNSAVED', module: 'BACKUP',
      userId: actorId, metadata: { driver, ok: result.ok, message: result.message },
    });
    return result;
  }

  async getCapacity(id: string): Promise<BackupStorageCapacity> {
    const row = await this.findOneRaw(id);
    const provider = this.storageProviderFactory.forStorageConfig(row);
    const capacity = await provider.getCapacity();
    const { sum } = await this.rawBackupJobRepo
      .createQueryBuilder('job')
      .select('COALESCE(SUM(job.compressed_size_bytes), 0)', 'sum')
      .where('job.storage_config_id = :id', { id })
      .andWhere("job.status IN ('completed', 'partial')")
      .getRawOne<{ sum: string }>() ?? { sum: '0' };
    return { ...capacity, usedByBackupsBytes: Number(sum) };
  }
}
