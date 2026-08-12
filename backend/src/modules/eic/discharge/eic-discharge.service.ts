import {
  Inject, Injectable, Logger, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EicDischargeSummary } from '../entities/eic-discharge-summary.entity';
import { EicDischargeSection } from '../entities/eic-discharge-section.entity';
import { AuditService } from '../../audit/audit.service';
import { EicDischargeStatus, EicSectionStatus } from '../common/enums/assessment-status.enum';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class EicDischargeService {
  private readonly logger = new Logger(EicDischargeService.name);

  constructor(
    @InjectRepository(EicDischargeSummary)
    private readonly dischargeRepo: Repository<EicDischargeSummary>,

    @InjectRepository(EicDischargeSection)
    private readonly sectionRepo: Repository<EicDischargeSection>,

    private readonly auditService: AuditService,

    /**
     * Stage B (Checkpoint B3.5) — scoped repository for `findById()`/
     * `findByEnrollment()` only. Every write path stays on `dischargeRepo`/
     * `sectionRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(EicDischargeSummary))
    private readonly scopedDischargeRepo: TenantScopedRepository<EicDischargeSummary>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async initiate(
    enrollmentId: string,
    dischargeReason: string,
    dischargeDate: string,
    disciplines: EicDiscipline[],
    actorId: string,
  ): Promise<EicDischargeSummary> {
    const existing = await this.dischargeRepo.findOne({ where: { enrollmentId } });
    if (existing) throw new ConflictException('Discharge already initiated for this enrollment');

    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const summary = this.dischargeRepo.create({
      enrollmentId,
      dischargeReason,
      dischargeDate,
      status:      EicDischargeStatus.PENDING_SECTIONS,
      initiatedBy: actorId,
      tenantId,
    });

    const saved = await this.dischargeRepo.save(summary);

    await Promise.all(
      disciplines.map((discipline) =>
        this.sectionRepo.save(
          this.sectionRepo.create({ dischargeId: saved.id, discipline, tenantId }),
        ),
      ),
    );

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_DISCHARGE_INITIATED',
      entityType: 'eic_discharge_summaries',
      entityId:   saved.id,
      userId: actorId,
      metadata:   { enrollmentId, dischargeReason, dischargeDate },
    });

    return this.findById(saved.id);
  }

  async findById(id: string): Promise<EicDischargeSummary> {
    const discharge = await this.scopedDischargeRepo.findOne({
      where: { id },
      relations: ['sections'],
    });
    if (!discharge) throw new NotFoundException(`Discharge ${id} not found`);
    // A5.5 API Contract Audit: backs GET /eic/discharge/:id -- eager
    // `sections` relation (also carrying its own tenantId) makes an
    // explicit .select() column list impractical, so strip post-fetch.
    this.stripTenantId(discharge);
    return discharge;
  }

  async findByEnrollment(enrollmentId: string): Promise<EicDischargeSummary | null> {
    const discharge = await this.scopedDischargeRepo.findOne({
      where: { enrollmentId },
      relations: ['sections'],
    });
    // A5.5 API Contract Audit: backs GET /eic/enrollments/:enrollmentId/discharge.
    this.stripTenantId(discharge);
    return discharge;
  }

  // ── Strip tenant_id from a discharge summary (+ eager sections) before it
  // reaches a GET response -- see A5.5 API Contract Audit notes above. ──────
  private stripTenantId(discharge: EicDischargeSummary | null): void {
    if (!discharge) return;
    delete (discharge as { tenantId?: string | null }).tenantId;
    for (const s of discharge.sections ?? []) delete (s as { tenantId?: string | null }).tenantId;
  }

  async updateHeader(
    id: string,
    data: { overallProgress?: string; homeProgramme?: string; followUpPlan?: string },
  ): Promise<EicDischargeSummary> {
    const discharge = await this.findById(id);
    if (discharge.status === EicDischargeStatus.SIGNED) {
      throw new BadRequestException('Cannot update a signed discharge summary');
    }
    await this.dischargeRepo.update(id, data);
    return this.findById(id);
  }

  async updateSection(
    dischargeId: string,
    discipline: EicDiscipline,
    data: Partial<EicDischargeSection>,
    actorId: string,
  ): Promise<EicDischargeSection> {
    const section = await this.sectionRepo.findOne({
      where: { dischargeId, discipline },
    });
    if (!section) throw new NotFoundException(`Section ${discipline} not found`);

    await this.sectionRepo.update(section.id, data as any);
    return this.sectionRepo.findOneOrFail({ where: { id: section.id } });
  }

  async submitSection(
    dischargeId: string,
    discipline: EicDiscipline,
    actorId: string,
  ): Promise<EicDischargeSummary> {
    await this.sectionRepo.update(
      { dischargeId, discipline },
      { status: EicSectionStatus.SUBMITTED, submittedAt: new Date(), therapistId: actorId },
    );

    const discharge = await this.findById(dischargeId);
    const pending   = discharge.sections.filter((s) => s.status !== EicSectionStatus.SUBMITTED);

    if (pending.length === 0) {
      await this.dischargeRepo.update(dischargeId, {
        status: EicDischargeStatus.PENDING_SIGNATURE,
      });
    }

    return this.findById(dischargeId);
  }

  async sign(
    dischargeId: string,
    actorId: string,
    signatoryName: string,
    signatoryDesignation: string,
  ): Promise<EicDischargeSummary> {
    const discharge = await this.findById(dischargeId);

    if (discharge.status !== EicDischargeStatus.PENDING_SIGNATURE) {
      throw new BadRequestException('Discharge must be PENDING_SIGNATURE to sign');
    }

    await this.dischargeRepo.update(dischargeId, {
      status:               EicDischargeStatus.SIGNED,
      signedBy:             actorId,
      signedAt:             new Date(),
      signatoryName,
      signatoryDesignation,
    });

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_DISCHARGE_SIGNED',
      entityType: 'eic_discharge_summaries',
      entityId:   dischargeId,
      userId: actorId,
    });

    return this.findById(dischargeId);
  }
}
