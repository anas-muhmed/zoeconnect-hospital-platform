import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, OptimisticLockVersionMismatchError } from 'typeorm';
import { IncidentInvestigation } from '../entities/incident-investigation.entity';
import { IncidentInvestigationStatement } from '../entities/incident-investigation-statement.entity';
import { IncidentService } from '../incidents/incident.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { AuditService } from '../../audit/audit.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { CreateInvestigationDto, UpdateInvestigationDto, AddStatementDto } from '../dto/incident-investigation.dto';
import type { User } from '../../users/entities/user.entity';

/**
 * IncidentInvestigationService — multi-investigator investigation management.
 *
 * Key design:
 *   - Multiple investigations per incident (e.g., reopened after rejection)
 *   - Each investigation has a lead + team (multi-investigator per directive #7)
 *   - Statements are attached to investigations, not incidents directly
 *   - Completing an investigation transitions incident to RCA_PENDING
 */
@Injectable()
export class IncidentInvestigationService {
  private readonly logger = new Logger(IncidentInvestigationService.name);

  constructor(
    @InjectRepository(IncidentInvestigation)
    private readonly invRepo: Repository<IncidentInvestigation>,
    @InjectRepository(IncidentInvestigationStatement)
    private readonly stmtRepo: Repository<IncidentInvestigationStatement>,
    private readonly incidentService: IncidentService,
    private readonly timeline: IncidentTimelineService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(incidentId: string, dto: CreateInvestigationDto, actor: User): Promise<IncidentInvestigation> {
    await this.incidentService.findOne(incidentId); // validates existence + tenant
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const inv = this.invRepo.create({
      tenantId,
      incidentId,
      title: dto.title,
      leadId: dto.leadId,
      teamMemberIds: dto.teamMemberIds ?? [],
      status: 'OPEN',
      startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
      createdById: actor.id,
    });

    const saved = await this.invRepo.save(inv);

    // Transition incident to INVESTIGATION
    await this.incidentService.transition(incidentId, 'INVESTIGATION', actor, {
      investigationId: saved.id,
    });

    await this.timeline.emit({
      incidentId,
      eventType: 'INVESTIGATION_STARTED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Investigation started: "${dto.title}" — Lead: ${dto.leadId}`,
      metadata: { investigationId: saved.id, teamSize: (dto.teamMemberIds?.length ?? 0) + 1 },
    });

    return saved;
  }

  async findAll(incidentId: string): Promise<IncidentInvestigation[]> {
    await this.incidentService.findOne(incidentId);
    return this.invRepo.find({
      where: { incidentId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<IncidentInvestigation> {
    const inv = await this.invRepo.findOne({ where: { id } });
    if (!inv) throw new NotFoundException(`Investigation ${id} not found`);
    return inv;
  }

  async update(incidentId: string, id: string, dto: UpdateInvestigationDto, actor: User): Promise<IncidentInvestigation> {
    const inv = await this.findOne(id);
    if (inv.incidentId !== incidentId) throw new ForbiddenException('Investigation does not belong to this incident');

    const isCompleting = dto.completedAt && inv.status !== 'COMPLETED';

    const payload = {
      ...dto,
      leadId: dto.leadId ?? inv.leadId,
      teamMemberIds: dto.teamMemberIds ?? inv.teamMemberIds,
      status: isCompleting ? 'COMPLETED' : inv.status,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : inv.completedAt,
    };
    
    const result = await this.invRepo.update(
      { id, version: inv.version },
      payload,
    );

    if (result.affected === 0) {
      throw new OptimisticLockVersionMismatchError('IncidentInvestigation', inv.version, inv.version + 1);
    }

    if (isCompleting) {
      await this.incidentService.transition(incidentId, 'RCA_PENDING', actor, { investigationId: id });
      await this.timeline.emit({
        incidentId,
        eventType: 'INVESTIGATION_COMPLETED',
        actorId: actor.id,
        actorName: actor.fullName ?? actor.username,
        description: `Investigation "${inv.title}" completed`,
      });
    }

    return this.findOne(id);
  }

  async addStatement(investigationId: string, dto: AddStatementDto, actor: User): Promise<IncidentInvestigationStatement> {
    const inv = await this.findOne(investigationId);
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const stmt = this.stmtRepo.create({
      tenantId,
      investigationId,
      statementType: dto.statementType,
      personName: dto.personName,
      personRole: dto.personRole ?? null,
      department: dto.department ?? null,
      statementText: dto.statementText,
      statementDate: dto.statementDate ? new Date(dto.statementDate) : new Date(),
      recordedById: actor.id,
    });

    const saved = await this.stmtRepo.save(stmt);

    await this.timeline.emit({
      incidentId: inv.incidentId,
      eventType: 'STATEMENT_ADDED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Statement recorded from ${dto.personName} (${dto.statementType})`,
    });

    return saved;
  }

  async getStatements(investigationId: string): Promise<IncidentInvestigationStatement[]> {
    return this.stmtRepo.find({
      where: { investigationId },
      order: { statementDate: 'ASC' },
    });
  }
}
