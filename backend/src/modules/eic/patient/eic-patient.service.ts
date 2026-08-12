import {
  Inject, Injectable, Logger, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { InjectRedis } from '../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { EicPatient } from '../entities/eic-patient.entity';
import { branchFilter } from '../../branch/branch.service';
import { EicDevelopmentalHistory } from '../entities/eic-developmental-history.entity';
import { PatientService } from '../../his/patient/patient.service';
import { AuditService } from '../../audit/audit.service';
import type { CreateEicPatientDto } from './dto/create-patient.dto';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

const EIC_CACHE = {
  PATIENT:  (id: string) => `eic:patient:${id}`,
  PATIENT_MRN: (mrn: string) => `eic:patient:mrn:${mrn.toUpperCase()}`,
  TTL: 300, // 5 minutes
};

@Injectable()
export class EicPatientService {
  private readonly logger = new Logger(EicPatientService.name);

  constructor(
    @InjectRepository(EicPatient)
    private readonly patientRepo: Repository<EicPatient>,

    @InjectRepository(EicDevelopmentalHistory)
    private readonly devHistoryRepo: Repository<EicDevelopmentalHistory>,

    @InjectRedis()
    private readonly redis: Redis,

    private readonly hisPatientService: PatientService,
    private readonly auditService: AuditService,

    /**
     * Stage B (Checkpoint B3.5) — scoped repositories for `lookupByMrn()`,
     * `findAll()`, `getDevelopmentalHistory()`, `findById()`, `getSyncStatus()`,
     * `findByMrn()` only. Every write path (`createFromHis`, `createManual`,
     * `syncFromHis`, `saveDevelopmentalHistory`) and `batchSyncFromHis()`
     * (detached fire-and-forget async work, outlives the HTTP request per
     * the Execution Context Classification) stay on `patientRepo`/`devHistoryRepo`
     * above, untouched.
     */
    @Inject(getTenantScopedRepositoryToken(EicPatient))
    private readonly scopedPatientRepo: TenantScopedRepository<EicPatient>,
    @Inject(getTenantScopedRepositoryToken(EicDevelopmentalHistory))
    private readonly scopedDevHistoryRepo: TenantScopedRepository<EicDevelopmentalHistory>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /**
   * Typeahead: search HIS by partial MRN or name — returns lightweight suggestion list.
   * Delegates directly to HisPatientService.search() so the SQL/config lives in one place.
   */
  async hisSearch(q: string, limit = 10) {
    return this.hisPatientService.search(q.trim(), Math.min(limit, 20));
  }

  /**
   * Lookup patient by MRN — first checks EIC table, then pulls from HIS.
   * Returns HIS data merged with any existing EIC record.
   */
  async lookupByMrn(mrn: string): Promise<{ hisData: unknown; eicPatient: EicPatient | null }> {
    const normalized = mrn.toUpperCase().trim();

    // Pull HIS record (cached by HisPatientService)
    const hisData = await this.hisPatientService.getByMrn(normalized);

    // Check if already in EIC
    const eicPatient = await this.scopedPatientRepo.findOne({
      where: { mrn: normalized },
      relations: ['developmentalHistory'],
    });

    // A5.5 API Contract Audit: backs GET /eic/patients/search -- eager
    // `developmentalHistory` relation makes an explicit .select() column
    // list impractical, so strip tenantId post-fetch instead.
    this.stripTenantId(eicPatient);

    return { hisData, eicPatient };
  }

  /**
   * Create EIC patient from HIS data (called during enrollment)
   */
  async createFromHis(mrn: string, actorId: string, branchId?: string | null): Promise<EicPatient> {
    const normalized = mrn.toUpperCase().trim();

    const existing = await this.patientRepo.findOne({ where: { mrn: normalized } });
    if (existing) return existing;

    const his = await this.hisPatientService.getByMrn(normalized);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const patient = this.patientRepo.create({
      mrn:                  normalized,
      salutation:           his.salutation ?? null,
      firstName:            his.firstName,
      middleName:           his.middleName ?? null,
      lastName:             his.lastName,
      fullName:             his.fullName,
      gender:               his.gender ?? null,
      dateOfBirth:          his.dateOfBirth ?? null,
      mobile:               his.mobile ?? null,
      email:                his.email ?? null,
      hisSyncedAt:          new Date(),
      branchId:             branchId ?? undefined,
      tenantId,
    });

    const saved = await this.patientRepo.save(patient);
    await this.invalidateCache(normalized, saved.id);

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_PATIENT_CREATED_FROM_HIS',
      entityType: 'eic_patient',
      entityId:   saved.id,
      userId: actorId,
      metadata:   { mrn: normalized },
    });

    return saved;
  }

  /**
   * Create EIC patient manually (when HIS is unavailable)
   */
  async createManual(dto: CreateEicPatientDto, actorId: string, branchId?: string | null): Promise<EicPatient> {
    const normalized = dto.mrn.toUpperCase().trim();

    const existing = await this.patientRepo.findOne({ where: { mrn: normalized } });
    if (existing) throw new ConflictException(`Patient MRN ${normalized} already exists in EIC`);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const patient = this.patientRepo.create({
      ...dto,
      mrn:      normalized,
      fullName: [dto.salutation, dto.firstName, dto.middleName, dto.lastName]
                  .filter(Boolean).join(' '),
      branchId: branchId ?? undefined,
      tenantId,
    });

    const saved = await this.patientRepo.save(patient);
    await this.invalidateCache(normalized, saved.id);

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_PATIENT_CREATED_MANUAL',
      entityType: 'eic_patient',
      entityId:   saved.id,
      userId: actorId,
      metadata:   { mrn: normalized },
    });

    return saved;
  }

  async findById(id: string): Promise<EicPatient> {
    const cached = await this.redis.get(EIC_CACHE.PATIENT(id));
    if (cached) return JSON.parse(cached);

    const patient = await this.scopedPatientRepo.findOne({
      where: { id },
      relations: ['developmentalHistory', 'enrollments'],
    });
    if (!patient) throw new NotFoundException(`EIC patient ${id} not found`);

    // A5.5 API Contract Audit: backs GET /eic/patients/:id -- eager
    // `developmentalHistory`/`enrollments` relations make an explicit
    // .select() column list impractical, so strip tenantId post-fetch
    // instead, before it's cached (so the cached copy never carries it
    // either).
    this.stripTenantId(patient);

    await this.redis.setex(EIC_CACHE.PATIENT(id), EIC_CACHE.TTL, JSON.stringify(patient));
    return patient;
  }

  async findAll(q?: string, branchId?: string | null): Promise<EicPatient[]> {
    const qb = (await this.scopedPatientRepo.createQueryBuilder('p'))
      .take(50);

    if (q?.trim()) {
      const term = `%${q.trim()}%`;
      qb.andWhere('(p.full_name ILIKE :term OR p.mrn ILIKE :term)', { term })
        .orderBy('p.full_name', 'ASC');
    } else {
      qb.orderBy('p.created_at', 'DESC');
    }

    if (branchId) {
      qb.andWhere(`${branchFilter('p')} = :branchId`, { branchId });
    }

    const patients = await qb.getMany();
    // A5.5 API Contract Audit: backs GET /eic/patients -- strip tenantId
    // post-fetch (query-builder .getMany() makes an explicit .select()
    // column list impractical here).
    patients.forEach((p) => delete (p as { tenantId?: string | null }).tenantId);
    return patients;
  }

  async getDevelopmentalHistory(patientId: string): Promise<EicDevelopmentalHistory | null> {
    const history = await this.scopedDevHistoryRepo.findOne({ where: { patientId } });
    // A5.5 API Contract Audit: backs GET /eic/patients/:id/developmental-history.
    if (history) delete (history as { tenantId?: string | null }).tenantId;
    return history;
  }

  // ── Strip tenant_id from a patient (+ eager developmentalHistory/enrollments)
  // before it reaches a GET response -- see A5.5 API Contract Audit notes above.
  private stripTenantId(patient: EicPatient | null): void {
    if (!patient) return;
    delete (patient as { tenantId?: string | null }).tenantId;
    if (patient.developmentalHistory) {
      delete (patient.developmentalHistory as { tenantId?: string | null }).tenantId;
    }
    if (Array.isArray(patient.enrollments)) {
      for (const e of patient.enrollments) delete (e as { tenantId?: string | null }).tenantId;
    }
  }

  async findByMrn(mrn: string): Promise<EicPatient | null> {
    const normalized = mrn.toUpperCase().trim();
    const cached = await this.redis.get(EIC_CACHE.PATIENT_MRN(normalized));
    if (cached) return JSON.parse(cached);

    const patient = await this.scopedPatientRepo.findOne({
      where: { mrn: normalized },
      relations: ['developmentalHistory'],
    });

    if (patient) {
      await this.redis.setex(EIC_CACHE.PATIENT_MRN(normalized), EIC_CACHE.TTL, JSON.stringify(patient));
    }
    return patient;
  }

  /**
   * Sync demographics from HIS for an existing EIC patient
   */
  async syncFromHis(patientId: string, actorId: string): Promise<EicPatient> {
    const patient = await this.patientRepo.findOneOrFail({ where: { id: patientId } });
    const his = await this.hisPatientService.getByMrn(patient.mrn);

    await this.patientRepo.update(patientId, {
      firstName:   his.firstName,
      middleName:  his.middleName ?? null,
      lastName:    his.lastName,
      fullName:    his.fullName,
      gender:      his.gender ?? null,
      dateOfBirth: his.dateOfBirth ?? null,
      mobile:      his.mobile ?? null,
      email:       his.email ?? null,
      hisSyncedAt: new Date(),
    });

    await this.invalidateCache(patient.mrn, patientId);
    this.logger.log(`EIC patient ${patientId} synced from HIS`);
    return this.findById(patientId);
  }

  /**
   * Returns all EIC patients with their HIS sync status for the sync dashboard.
   */
  async getSyncStatus(): Promise<{
    summary: { total: number; synced: number; neverSynced: number; lastSyncAt: string | null };
    patients: Array<{ id: string; mrn: string; fullName: string; isActive: boolean; hisSyncedAt: string | null }>;
  }> {
    const patients = await this.scopedPatientRepo.find({
      select: ['id', 'mrn', 'fullName', 'isActive', 'hisSyncedAt'],
      order: { fullName: 'ASC' },
    });

    const synced     = patients.filter((p) => p.hisSyncedAt != null);
    const neverSynced = patients.filter((p) => p.hisSyncedAt == null);
    const dates       = synced.map((p) => new Date(p.hisSyncedAt!).getTime());
    const lastSyncAt  = dates.length ? new Date(Math.max(...dates)).toISOString() : null;

    return {
      summary: {
        total:      patients.length,
        synced:     synced.length,
        neverSynced: neverSynced.length,
        lastSyncAt,
      },
      patients: patients.map((p) => ({
        id:          p.id,
        mrn:         p.mrn,
        fullName:    p.fullName,
        isActive:    p.isActive,
        hisSyncedAt: p.hisSyncedAt ? new Date(p.hisSyncedAt).toISOString() : null,
      })),
    };
  }

  /**
   * Batch sync demographics from HIS for all active EIC patients.
   * Runs in the background — returns a job summary immediately.
   * Results are reflected in `hisSyncedAt` on each patient record.
   */
  async batchSyncFromHis(actorId: string): Promise<{
    queued: boolean;
    totalPatients: number;
    message: string;
  }> {
    const patients = await this.patientRepo.find({
      where: { isActive: true },
      select: ['id', 'mrn', 'fullName'],
      order: { fullName: 'ASC' },
    });

    const total = patients.length;

    // Fire-and-forget in background — don't await
    (async () => {
      let synced = 0;
      let failed = 0;
      for (const patient of patients) {
        try {
          await this.syncFromHis(patient.id, actorId);
          synced++;
        } catch (err) {
          failed++;
          this.logger.warn(`Batch sync failed for ${patient.mrn}: ${(err as Error).message}`);
        }
      }
      this.logger.log(`EIC batch HIS sync complete: ${synced} synced, ${failed} failed out of ${total}`);
    })();

    return {
      queued:        true,
      totalPatients: total,
      message:       `Batch sync started for ${total} patients. Demographics will update progressively.`,
    };
  }

  async saveDevelopmentalHistory(
    patientId: string,
    data: Partial<EicDevelopmentalHistory>,
    actorId: string,
  ): Promise<EicDevelopmentalHistory> {
    const patient = await this.findById(patientId);
    const existing = await this.devHistoryRepo.findOne({ where: { patientId } });

    let saved: EicDevelopmentalHistory;
    if (existing) {
      await this.devHistoryRepo.update(existing.id, { ...data, recordedBy: actorId } as any);
      saved = await this.devHistoryRepo.findOneOrFail({ where: { id: existing.id } });
    } else {
      const record = this.devHistoryRepo.create({ ...data, patientId, recordedBy: actorId });
      saved = await this.devHistoryRepo.save(record);
    }

    await this.invalidateCache(patient.mrn, patientId);
    return saved;
  }

  private async invalidateCache(mrn: string, id: string): Promise<void> {
    await Promise.all([
      this.redis.del(EIC_CACHE.PATIENT(id)),
      this.redis.del(EIC_CACHE.PATIENT_MRN(mrn)),
    ]);
  }
}
