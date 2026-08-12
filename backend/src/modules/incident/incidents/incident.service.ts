import {
  Injectable, Logger, NotFoundException, ForbiddenException,
  ConflictException, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, OptimisticLockVersionMismatchError } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { Incident } from '../entities/incident.entity';
import { IncidentRiskMatrixConfig } from '../entities/incident-risk-matrix-config.entity';
import { CreateIncidentDto, ListIncidentsDto, AssignIncidentDto, UpdateResidualRiskDto } from '../dto/incident.dto';
import { IncidentWorkflowService } from './incident-workflow.service';
import { IncidentNumberService } from './incident-number.service';
import { IncidentSlaService } from './incident-sla.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { IncidentNotificationRuleService } from '../notifications/incident-notification-rule.service';
import { AuditService } from '../../audit/audit.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import type { User } from '../../users/entities/user.entity';
import {
  IncidentAssignedEvent,
  IncidentReassignedEvent,
  IncidentStatusChangedEvent,
} from '../domain/events/incident-events';

/**
 * IncidentService — core CRUD and workflow for the Incident Management module.
 *
 * Design principles:
 * - All writes audit-log via AuditService.log() (fire-and-forget)
 * - All status transitions validated by IncidentWorkflowService
 * - All reads use scopedRepo (enforced tenant isolation)
 * - SLA deadlines computed at create + on severity change
 * - Notification rules evaluated after every transition
 */
@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly repo: Repository<Incident>,

    @Inject(getTenantScopedRepositoryToken(Incident))
    private readonly scopedRepo: TenantScopedRepository<Incident>,

    @InjectRepository(IncidentRiskMatrixConfig)
    private readonly riskRepo: Repository<IncidentRiskMatrixConfig>,

    private readonly workflow: IncidentWorkflowService,
    private readonly numberService: IncidentNumberService,
    private readonly slaService: IncidentSlaService,
    private readonly timeline: IncidentTimelineService,
    private readonly notifRules: IncidentNotificationRuleService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextStorage,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateIncidentDto, actor: User): Promise<Incident> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    // Generate hospital-prefixed incident number
    const incidentNumber = await this.numberService.generateNumber(
      tenantId,
      async (year, tid) => {
        const q = this.repo.createQueryBuilder('i')
          .where('EXTRACT(YEAR FROM i.created_at) = :year', { year });
        if (tid) q.andWhere('i.tenant_id = :tid', { tid });
        return q.getCount();
      },
    );

    // Compute initial risk score from risk matrix
    let riskScore: number | null = null;
    let riskLevel: string | null = null;
    if (dto.likelihood && dto.impact) {
      const matrix = await this.riskRepo.findOne({
        where: { likelihood: dto.likelihood, impact: dto.impact },
      });
      if (matrix) {
        riskScore = matrix.riskScore;
        riskLevel = matrix.riskLevel;
      }
    }

    // Compute SLA deadlines from severity
    const sla = await this.slaService.computeSlaDeadlines(
      dto.severityCode,
      tenantId,
    );

    const incident = this.repo.create({
      tenantId,
      incidentNumber,
      status: 'DRAFT',
      currentStage: 'REPORTING',
      categoryId: dto.categoryId,
      typeId: dto.typeId ?? null,
      severityCode: dto.severityCode,
      priorityCode: dto.priorityCode ?? 'ROUTINE',
      riskScore,
      riskLevel,
      incidentDate: new Date(dto.incidentDate),
      department: dto.department,
      ward: dto.ward ?? null,
      location: dto.location ?? null,
      reporterId: actor.id,
      patientMrn: dto.patientMrn ?? null,
      employeeId: dto.employeeId ?? null,
      description: dto.description,
      immediateAction: dto.immediateAction ?? null,
      isAnonymous: dto.isAnonymous ?? false,
      isNearMiss: dto.isNearMiss ?? false,
      isSentinelEvent: dto.isSentinelEvent ?? false,
      tags: dto.tags ?? [],
      createdById: actor.id,
      ...sla,
    });

    const saved = await this.repo.save(incident);

    await this.timeline.emit({
      incidentId: saved.id,
      eventType: 'INCIDENT_CREATED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Incident ${incidentNumber} created in ${dto.department}`,
      metadata: { severityCode: dto.severityCode, isNearMiss: dto.isNearMiss },
    });

    await this.audit.log({
      action: 'INCIDENT_CREATED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'Incident',
      entityId: saved.id,
      newValue: { incidentNumber, status: 'DRAFT', severityCode: dto.severityCode },
    });

    // Emit domain event — notification handled by @OnEvent listener
    this.eventEmitter.emit(
      'incident.status.changed',
      new IncidentStatusChangedEvent(
        crypto.randomUUID(),
        crypto.randomUUID(),
        tenantId,
        new Date(),
        actor.id,
        saved.id,
        saved.version,
        '',       // no previous status for creation
        'DRAFT',
      ),
    );

    return saved;
  }

  // ── List ─────────────────────────────────────────────────────────────────

  async findAll(filters: ListIncidentsDto): Promise<{ data: Incident[]; total: number; page: number; limit: number }> {
    const page  = filters.page  ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip  = (page - 1) * limit;

    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    // Whitelisted against ListIncidentsDto's @IsIn — never interpolate an
    // unvalidated column name into orderBy.
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'DESC';

    const qb = this.repo.createQueryBuilder('i')
      .orderBy(`i.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    if (tenantId) qb.andWhere('i.tenantId = :tid', { tid: tenantId });

    if (filters.status)       qb.andWhere('i.status = :status', { status: filters.status });
    if (filters.severityCode) qb.andWhere('i.severityCode = :sev', { sev: filters.severityCode });
    if (filters.department)   qb.andWhere('i.department ILIKE :dep', { dep: `%${filters.department}%` });
    if (filters.categoryId)   qb.andWhere('i.categoryId = :cat', { cat: filters.categoryId });
    if (filters.patientMrn)   qb.andWhere('i.patientMrn = :mrn', { mrn: filters.patientMrn });
    if (filters.investigatorId) qb.andWhere('i.leadInvestigatorId = :inv', { inv: filters.investigatorId });
    if (filters.isNearMiss !== undefined) qb.andWhere('i.isNearMiss = :nm', { nm: filters.isNearMiss });
    if (filters.isSentinelEvent !== undefined) qb.andWhere('i.isSentinelEvent = :se', { se: filters.isSentinelEvent });
    if (filters.fromDate)     qb.andWhere('i.incidentDate >= :from', { from: filters.fromDate });
    if (filters.toDate)       qb.andWhere('i.incidentDate <= :to',   { to: filters.toDate });
    if (filters.search) {
      qb.andWhere('(i.incidentNumber ILIKE :q OR i.description ILIKE :q)', { q: `%${filters.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  // ── Find one ─────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<Incident> {
    const incident = await this.scopedRepo.findOne({ 
      where: { id },
      relations: ['category', 'type']
    });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    return incident;
  }

  // ── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: Partial<CreateIncidentDto>, actor: User): Promise<Incident> {
    const incident = await this.findOne(id);

    if (this.workflow.isClosed(incident.status)) {
      throw new ForbiddenException('Cannot edit a closed incident');
    }

    const old = { ...incident };

    // Recompute SLA if severity changed
    let sla = {};
    if (dto.severityCode && dto.severityCode !== incident.severityCode) {
      sla = await this.slaService.computeSlaDeadlines(
        dto.severityCode,
        incident.tenantId,
        incident.createdAt,
      );
    }

    // Recompute risk if likelihood/impact provided
    let riskFields = {};
    if (dto.likelihood && dto.impact) {
      const matrix = await this.riskRepo.findOne({
        where: { likelihood: dto.likelihood, impact: dto.impact },
      });
      if (matrix) riskFields = { riskScore: matrix.riskScore, riskLevel: matrix.riskLevel };
    }

    const payload = {
      ...(dto as any),
      ...sla,
      ...riskFields,
      updatedById: actor.id,
      incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : incident.incidentDate,
    };

    const result = await this.repo.update(
      { id, version: incident.version },
      payload,
    );

    if (result.affected === 0) {
      throw new OptimisticLockVersionMismatchError('Incident', incident.version, incident.version + 1);
    }

    await this.timeline.emit({
      incidentId: id,
      eventType: 'NOTE_ADDED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Incident updated by ${actor.fullName ?? actor.username}`,
    });

    await this.audit.log({
      action: 'INCIDENT_UPDATED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'Incident',
      entityId: id,
      oldValue: { status: old.status, severityCode: old.severityCode } as Record<string, unknown>,
      newValue: { severityCode: dto.severityCode ?? incident.severityCode } as Record<string, unknown>,
    });

    return this.findOne(id);
  }

  // ── Status Transition ─────────────────────────────────────────────────────

  async transition(id: string, targetStatus: string, actor: User, meta?: Record<string, unknown>): Promise<Incident> {
    const incident = await this.findOne(id);
    this.workflow.validateTransition(incident.status, targetStatus);

    const oldStatus = incident.status;
    await this.repo.update(id, {
      status: targetStatus,
      currentStage: this.workflow.stageLabel(targetStatus),
      updatedById: actor.id,
    });

    await this.timeline.emit({
      incidentId: id,
      eventType: 'STATUS_CHANGED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Status changed: ${oldStatus} → ${targetStatus}`,
      metadata: { oldStatus, targetStatus, ...meta },
    });

    await this.audit.log({
      action: 'INCIDENT_STATUS_CHANGED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'Incident',
      entityId: id,
      oldValue: { status: oldStatus } as Record<string, unknown>,
      newValue: { status: targetStatus } as Record<string, unknown>,
    });

    const updated = await this.findOne(id);

    // Emit domain event — notification handler listens via @OnEvent
    this.eventEmitter.emit(
      'incident.status.changed',
      new IncidentStatusChangedEvent(
        crypto.randomUUID(),
        (meta?.['correlationId'] as string) ?? crypto.randomUUID(),
        incident.tenantId,
        new Date(),
        actor.id,
        id,
        updated.version,
        oldStatus,
        targetStatus,
      ),
    );

    return updated;
  }

  // ── Assign ────────────────────────────────────────────────────────────────

  async assign(id: string, dto: AssignIncidentDto, actor: User): Promise<Incident> {
    const incident = await this.findOne(id);
    this.workflow.validateTransition(incident.status, 'ASSIGNED');

    const previousAssigneeId = incident.leadInvestigatorId ?? null;
    const isReassignment = !!previousAssigneeId && previousAssigneeId !== dto.investigatorId;

    await this.repo.update(id, {
      leadInvestigatorId: dto.investigatorId,
      status: 'ASSIGNED',
      currentStage: 'Assigned',
      updatedById: actor.id,
    });

    await this.timeline.emit({
      incidentId: id,
      eventType: isReassignment ? 'INCIDENT_REASSIGNED' : 'INCIDENT_ASSIGNED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: isReassignment
        ? `Incident reassigned to new investigator`
        : `Incident assigned to investigator`,
      metadata: { investigatorId: dto.investigatorId, previousAssigneeId, teamMemberIds: dto.teamMemberIds },
    });

    const updated = await this.findOne(id);

    // Emit distinct domain events for first assignment vs. reassignment
    const baseEvent = {
      eventId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      tenantId: incident.tenantId,
      timestamp: new Date(),
      actorId: actor.id,
      incidentId: id,
      entityVersion: updated.version,
      teamMemberIds: dto.teamMemberIds,
    };

    if (isReassignment) {
      this.eventEmitter.emit(
        'incident.reassigned',
        new IncidentReassignedEvent(
          baseEvent.eventId, baseEvent.correlationId, baseEvent.tenantId,
          baseEvent.timestamp, baseEvent.actorId, baseEvent.incidentId,
          baseEvent.entityVersion, previousAssigneeId, dto.investigatorId,
          dto.teamMemberIds,
        ),
      );
    } else {
      this.eventEmitter.emit(
        'incident.assigned',
        new IncidentAssignedEvent(
          baseEvent.eventId, baseEvent.correlationId, baseEvent.tenantId,
          baseEvent.timestamp, baseEvent.actorId, baseEvent.incidentId,
          baseEvent.entityVersion, dto.investigatorId, dto.teamMemberIds,
        ),
      );
    }

    return updated;
  }

  // ── Residual Risk ─────────────────────────────────────────────────────────

  async updateResidualRisk(id: string, dto: UpdateResidualRiskDto, actor: User): Promise<Incident> {
    await this.findOne(id);

    const matrix = await this.riskRepo.findOne({
      where: { likelihood: dto.likelihood, impact: dto.impact },
    });

    const score = matrix?.riskScore ?? dto.likelihood * dto.impact;
    const level = matrix?.riskLevel ?? 'MEDIUM';

    const fields =
      dto.stage === 'PRE_CAPA'
        ? { residualRiskScorePreCapa: score, residualRiskLevelPreCapa: level }
        : { residualRiskScorePostCapa: score, residualRiskLevelPostCapa: level };

    await this.repo.update(id, { ...fields, updatedById: actor.id });

    await this.timeline.emit({
      incidentId: id,
      eventType: 'RESIDUAL_RISK_UPDATED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Residual risk updated (${dto.stage}): score=${score}, level=${level}`,
      metadata: { stage: dto.stage, likelihood: dto.likelihood, impact: dto.impact, riskScore: score, riskLevel: level },
    });

    return this.findOne(id);
  }

  // ── Delete (Draft only) ───────────────────────────────────────────────────

  async remove(id: string, actor: User): Promise<void> {
    const incident = await this.findOne(id);
    if (incident.status !== 'DRAFT') {
      throw new ForbiddenException('Only DRAFT incidents can be deleted');
    }
    await this.repo.delete(id);
    await this.audit.log({
      action: 'INCIDENT_DELETED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'Incident',
      entityId: id,
      oldValue: { incidentNumber: incident.incidentNumber } as Record<string, unknown>,
    });
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private toContext(incident: Incident): Record<string, unknown> {
    return {
      id: incident.id,
      incident_number: incident.incidentNumber,
      incidentNumber: incident.incidentNumber,
      status: incident.status,
      severity_code: incident.severityCode,
      severityCode: incident.severityCode,
      priority_code: incident.priorityCode,
      category_id: incident.categoryId,
      department: incident.department,
      is_near_miss: incident.isNearMiss,
      is_sentinel_event: incident.isSentinelEvent,
    };
  }
}
