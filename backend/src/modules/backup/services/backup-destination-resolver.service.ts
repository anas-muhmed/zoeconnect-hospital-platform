import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { BackupStorageConfig, BackupStoragePurpose } from '../entities/backup-storage-config.entity';

export type BackupRunPurpose = 'manual' | 'scheduled';

/**
 * BackupDestinationResolverService — the ONLY place that implements "which
 * backup storage destinations apply to this job", per points 1-5 and 9 of
 * the storage-hardening brief. BackupService/BackupSchedulerService call
 * into this rather than querying BackupStorageConfig directly, so the
 * tenant-isolation + purpose + environment rules stay in one auditable
 * place.
 *
 * TENANT-ISOLATION MODEL (documented per the brief's explicit ask for "your
 * call, document it"):
 *   A destination row is eligible for tenant T's backup iff:
 *     (a) row.tenantId === T (the tenant's own destination), OR
 *     (b) row.tenantId IS NULL AND row.shareable === true (an explicitly
 *         shareable platform-level destination).
 *   A tenant's backup NEVER resolves to another tenant's row, and never to
 *   a non-shareable global row implicitly -- "global" alone is not enough,
 *   an operator must explicitly flag a destination shareable=true before
 *   any tenant can use it. This is deliberately the simplest model that is
 *   still correct: no destination-sharing groups, no per-tenant allow-lists
 *   on a global row -- just "mine" or "explicitly everyone's".
 *   In self-hosted mode (tenantId is always null for every job), every
 *   tenantId-null row is eligible regardless of `shareable` -- there is no
 *   tenant isolation to enforce there, so `shareable` only matters in cloud
 *   mode.
 *
 * PURPOSE + ENVIRONMENT FILTERING:
 *   - purpose: a row with purpose='manual' is only eligible for manual runs,
 *     'scheduled' only for scheduled runs, 'both' (default) for either.
 *   - environment: if the caller supplies an environment (e.g. from
 *     DEPLOYMENT_ENVIRONMENT/NODE_ENV), a row is eligible if its own
 *     `environment` matches exactly OR is null (null = "applies everywhere").
 *     If the caller supplies no environment, every row is eligible
 *     regardless of its own `environment` tag (self-hosted installs
 *     typically never set this field at all).
 *
 * DEFAULT RESOLUTION: among eligible rows, prefer one with isDefault=true
 * (lowest `priority` breaks ties); if none is marked default, fall back to
 * the lowest-priority eligible row; if there are no eligible rows at all,
 * callers fall back to the process-wide local default
 * (BackupStorageProviderFactory.forDefaultLocal()).
 */
@Injectable()
export class BackupDestinationResolverService {
  constructor(
    @InjectRepository(BackupStorageConfig) private readonly storageConfigRepo: Repository<BackupStorageConfig>,
  ) {}

  private matchesPurpose(row: BackupStorageConfig, purpose: BackupRunPurpose): boolean {
    return row.purpose === 'both' || row.purpose === (purpose as BackupStoragePurpose);
  }

  private matchesEnvironment(row: BackupStorageConfig, environment?: string | null): boolean {
    if (!environment) return true;
    return !row.environment || row.environment === environment;
  }

  /** All active destinations eligible for `tenantId`'s jobs, regardless of purpose/environment -- used for admin listing/capacity views. */
  async listEligible(tenantId: string | null): Promise<BackupStorageConfig[]> {
    const rows = tenantId
      ? await this.storageConfigRepo.find({ where: [{ tenantId, isActive: true }, { tenantId: IsNull(), isActive: true, shareable: true }] })
      : await this.storageConfigRepo.find({ where: { tenantId: IsNull(), isActive: true } });
    return rows.sort((a, b) => a.priority - b.priority);
  }

  /** Eligible destinations for a specific run, filtered by purpose + environment, sorted by ascending priority. */
  async resolveEligibleDestinations(
    tenantId: string | null,
    opts: { purpose: BackupRunPurpose; environment?: string | null },
  ): Promise<BackupStorageConfig[]> {
    const rows = await this.listEligible(tenantId);
    return rows.filter((r) => this.matchesPurpose(r, opts.purpose) && this.matchesEnvironment(r, opts.environment));
  }

  /** The single default destination for a run, or null if none is configured/eligible (caller falls back to local). */
  async resolveDefault(
    tenantId: string | null,
    opts: { purpose: BackupRunPurpose; environment?: string | null },
  ): Promise<BackupStorageConfig | null> {
    const eligible = await this.resolveEligibleDestinations(tenantId, opts);
    if (eligible.length === 0) return null;
    const defaults = eligible.filter((r) => r.isDefault);
    return (defaults[0] ?? eligible[0]) ?? null;
  }

  /**
   * Resolves an explicit destination-id list (from CreateBackupDto/
   * BackupSchedule) against the tenant-isolation + purpose rules, throwing
   * if the caller asked for an id that isn't eligible (belongs to another
   * tenant, or a non-shareable global row) rather than silently dropping
   * it -- an admin explicitly picking a destination should get a clear
   * error, not a job that silently writes somewhere else.
   */
  async resolveExplicit(
    tenantId: string | null,
    ids: string[],
    opts: { purpose: BackupRunPurpose; environment?: string | null },
  ): Promise<BackupStorageConfig[]> {
    const eligibleById = new Map((await this.resolveEligibleDestinations(tenantId, opts)).map((r) => [r.id, r]));
    const resolved: BackupStorageConfig[] = [];
    for (const id of ids) {
      const row = eligibleById.get(id);
      if (!row) {
        const exists = await this.storageConfigRepo.findOne({ where: { id } });
        if (!exists) throw new NotFoundException(`Backup storage destination ${id} not found`);
        throw new ForbiddenException(`Backup storage destination ${id} is not eligible for this tenant/purpose/environment`);
      }
      resolved.push(row);
    }
    return resolved.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Full resolution entry point BackupService/BackupSchedulerService call:
   * given an explicit id list (possibly empty) and a single legacy
   * storageConfigId (possibly null), returns the ordered destination list
   * to actually write to, falling back to the tenant/purpose default, and
   * finally to an empty list (caller uses the process-wide local provider)
   * if nothing is configured at all.
   */
  async resolveForJob(params: {
    tenantId: string | null;
    purpose: BackupRunPurpose;
    environment?: string | null;
    explicitIds?: string[] | null;
    legacySingleId?: string | null;
  }): Promise<BackupStorageConfig[]> {
    const { tenantId, purpose, environment } = params;
    if (params.explicitIds && params.explicitIds.length > 0) {
      return this.resolveExplicit(tenantId, params.explicitIds, { purpose, environment });
    }
    if (params.legacySingleId) {
      return this.resolveExplicit(tenantId, [params.legacySingleId], { purpose, environment });
    }
    const def = await this.resolveDefault(tenantId, { purpose, environment });
    return def ? [def] : [];
  }
}
