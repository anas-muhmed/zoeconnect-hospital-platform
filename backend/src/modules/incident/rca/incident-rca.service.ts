import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, OptimisticLockVersionMismatchError } from 'typeorm';
import { IncidentRca } from '../entities/incident-rca.entity';
import { IncidentRcaFiveWhy } from '../entities/incident-rca-five-why.entity';
import { IncidentRcaFishboneNode } from '../entities/incident-rca-fishbone-node.entity';
import { IncidentService } from '../incidents/incident.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { AuditService } from '../../audit/audit.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { CreateRcaDto, UpdateRcaDto, AddFiveWhyDto, UpsertFishboneNodeDto } from '../dto/incident-rca.dto';
import type { User } from '../../users/entities/user.entity';

/**
 * IncidentRcaService — modular RCA framework supporting FIVE_WHY and FISHBONE.
 *
 * Architecture is extensible: new RCA methods (FAULT_TREE, BOWTIE) can be
 * added without schema changes — just new dto/service methods using the
 * same IncidentRca parent record.
 */
@Injectable()
export class IncidentRcaService {
  private readonly logger = new Logger(IncidentRcaService.name);

  constructor(
    @InjectRepository(IncidentRca)       private readonly rcaRepo:      Repository<IncidentRca>,
    @InjectRepository(IncidentRcaFiveWhy) private readonly whyRepo:     Repository<IncidentRcaFiveWhy>,
    @InjectRepository(IncidentRcaFishboneNode) private readonly fishRepo: Repository<IncidentRcaFishboneNode>,
    private readonly incidentService: IncidentService,
    private readonly timeline: IncidentTimelineService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(incidentId: string, dto: CreateRcaDto, actor: User): Promise<IncidentRca> {
    await this.incidentService.findOne(incidentId);
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const rca = this.rcaRepo.create({
      tenantId,
      incidentId,
      investigationId: dto.investigationId ?? null,
      method: dto.method,
      status: 'IN_PROGRESS',
      conductedById: actor.id,
    });

    const saved = await this.rcaRepo.save(rca);

    await this.timeline.emit({
      incidentId,
      eventType: 'RCA_STARTED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Root Cause Analysis started using method: ${dto.method}`,
      metadata: { rcaId: saved.id, method: dto.method },
    });

    return saved;
  }

  async findAll(incidentId: string): Promise<IncidentRca[]> {
    return this.rcaRepo.find({ where: { incidentId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<IncidentRca> {
    const rca = await this.rcaRepo.findOne({ where: { id } });
    if (!rca) throw new NotFoundException(`RCA ${id} not found`);
    return rca;
  }

  async update(incidentId: string, id: string, dto: UpdateRcaDto, actor: User): Promise<IncidentRca> {
    const rca = await this.findOne(id);
    const isCompleting = dto.status === 'COMPLETED' && rca.status !== 'COMPLETED';

    const payload = {
      ...dto,
      completedAt: isCompleting ? new Date() : rca.completedAt,
    };
    
    const result = await this.rcaRepo.update(
      { id, version: rca.version },
      payload,
    );

    if (result.affected === 0) {
      throw new OptimisticLockVersionMismatchError('IncidentRca', rca.version, rca.version + 1);
    }

    if (isCompleting) {
      await this.incidentService.transition(incidentId, 'CAPA_PENDING', actor, { rcaId: id });
      await this.timeline.emit({
        incidentId,
        eventType: 'RCA_COMPLETED',
        actorId: actor.id,
        actorName: actor.fullName ?? actor.username,
        description: `Root Cause Analysis completed. Root cause: ${dto.rootCause?.substring(0, 100) ?? 'N/A'}`,
        metadata: { rcaId: id, rootCause: dto.rootCause },
      });
    }

    return this.findOne(id);
  }

  // ── Five Why ──────────────────────────────────────────────────────────────

  async addFiveWhy(rcaId: string, dto: AddFiveWhyDto, actor: User): Promise<IncidentRcaFiveWhy> {
    const rca = await this.findOne(rcaId);
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    // Upsert by whyNumber (constraint on rca_id + why_number)
    const existing = await this.whyRepo.findOne({ where: { rcaId, whyNumber: dto.whyNumber } });
    if (existing) {
      await this.whyRepo.update(existing.id, { whyText: dto.whyText, because: dto.because ?? null });
      return this.whyRepo.findOneOrFail({ where: { id: existing.id } });
    }

    const why = this.whyRepo.create({ tenantId, rcaId, whyNumber: dto.whyNumber, whyText: dto.whyText, because: dto.because ?? null });
    return this.whyRepo.save(why);
  }

  async getFiveWhys(rcaId: string): Promise<IncidentRcaFiveWhy[]> {
    return this.whyRepo.find({ where: { rcaId }, order: { whyNumber: 'ASC' } });
  }

  // ── Fishbone ─────────────────────────────────────────────────────────────

  async upsertFishboneNode(rcaId: string, dto: UpsertFishboneNodeDto, actor: User): Promise<IncidentRcaFishboneNode> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    if (dto.id) {
      const existing = await this.fishRepo.findOne({ where: { id: dto.id, rcaId } });
      if (!existing) throw new NotFoundException(`Fishbone node ${dto.id} not found`);
      await this.fishRepo.update(dto.id, { causeText: dto.causeText, category: dto.category, parentId: dto.parentId ?? null, layout: dto.layout ?? null } as any);
      return this.fishRepo.findOneOrFail({ where: { id: dto.id } });
    }

    const node = this.fishRepo.create({
      tenantId,
      rcaId,
      category: dto.category,
      causeText: dto.causeText,
      parentId: dto.parentId ?? null,
      layout: dto.layout ?? null,
    });
    return this.fishRepo.save(node);
  }

  async getFishboneNodes(rcaId: string): Promise<IncidentRcaFishboneNode[]> {
    return this.fishRepo.find({ where: { rcaId }, order: { category: 'ASC' } });
  }

  async deleteFishboneNode(rcaId: string, nodeId: string): Promise<void> {
    const node = await this.fishRepo.findOne({ where: { id: nodeId, rcaId } });
    if (!node) throw new NotFoundException(`Fishbone node ${nodeId} not found`);
    await this.fishRepo.delete(nodeId);
  }
}
