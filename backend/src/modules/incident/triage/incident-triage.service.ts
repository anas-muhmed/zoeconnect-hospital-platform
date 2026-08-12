import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentTriage } from '../entities/incident-triage.entity';
import { IncidentService } from '../incidents/incident.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { AuditService } from '../../audit/audit.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { CreateTriageDto, UpdateTriageDto } from '../dto/incident-triage.dto';
import type { User } from '../../users/entities/user.entity';

/**
 * IncidentTriageService — manages the Triage stage of the incident lifecycle.
 *
 * Triage workflow:
 *   1. Incident reaches ASSIGNED status
 *   2. Triager creates/updates triage record
 *   3. Status transitions to TRIAGE
 *   4. If containmentRequired = true, status moves to CONTAINMENT
 *   5. Then INVESTIGATION begins
 *
 * For CRITICAL/HIGH severity incidents: triage should trigger immediate
 * escalation to the roles in escalationRoles (evaluated by notification rules).
 */
@Injectable()
export class IncidentTriageService {
  private readonly logger = new Logger(IncidentTriageService.name);

  constructor(
    @InjectRepository(IncidentTriage)
    private readonly triageRepo: Repository<IncidentTriage>,
    private readonly incidentService: IncidentService,
    private readonly timeline: IncidentTimelineService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(incidentId: string, dto: CreateTriageDto, actor: User): Promise<IncidentTriage> {
    const incident = await this.incidentService.findOne(incidentId);

    if (incident.status === 'ARCHIVED' || incident.status === 'CLOSED') {
      throw new ForbiddenException('Cannot triage a closed incident');
    }

    const existing = await this.triageRepo.findOne({ where: { incidentId } });
    if (existing) {
      return this.update(incidentId, dto, actor);
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const triage = this.triageRepo.create({
      tenantId,
      incidentId,
      triagedById: actor.id,
      assignedToId: dto.assignedToId ?? null,
      priorityCode: dto.priorityCode ?? incident.priorityCode,
      responseSlaHours: dto.responseSlaHours ?? null,
      escalationRequired: dto.escalationRequired ?? false,
      escalationRoles: dto.escalationRoles ?? [],
      containmentRequired: dto.containmentRequired ?? false,
      containmentNotes: dto.containmentNotes ?? null,
      triageNotes: dto.triageNotes ?? null,
    });

    const saved = await this.triageRepo.save(triage);

    // Transition incident to TRIAGE
    await this.incidentService.transition(incidentId, 'TRIAGE', actor, {
      containmentRequired: dto.containmentRequired,
      escalationRequired: dto.escalationRequired,
    });

    await this.timeline.emit({
      incidentId,
      eventType: 'TRIAGE_COMPLETED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Triage completed. Containment: ${dto.containmentRequired ? 'Required' : 'Not required'}. Escalation: ${dto.escalationRequired ? 'Yes' : 'No'}`,
      metadata: { escalationRoles: dto.escalationRoles, containmentRequired: dto.containmentRequired },
    });

    await this.audit.log({
      action: 'TRIAGE_CREATED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'IncidentTriage',
      entityId: saved.id,
    });

    return saved;
  }

  /**
   * Moves an incident from TRIAGE into CONTAINMENT once containment work is
   * ready to begin. This was previously a documented-but-unreachable state:
   * `CONTAINMENT` has always been a legal target in
   * IncidentWorkflowService's TRANSITIONS map, and the class docstring above
   * describes it as step 4 of the triage workflow, but nothing in the
   * codebase ever called `transition(id, 'CONTAINMENT', ...)` -- there was
   * no endpoint or UI action that reached it. Wired up here.
   */
  async beginContainment(incidentId: string, actor: User): Promise<IncidentTriage> {
    const triage = await this.triageRepo.findOne({ where: { incidentId } });
    if (!triage) {
      throw new NotFoundException(`Triage for incident ${incidentId} not found`);
    }

    await this.incidentService.transition(incidentId, 'CONTAINMENT', actor, {
      reason: 'Containment measures started',
    });

    await this.timeline.emit({
      incidentId,
      eventType: 'CONTAINMENT_STARTED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Containment stage started${triage.containmentNotes ? `: ${triage.containmentNotes}` : ''}`,
      metadata: { triageId: triage.id },
    });

    await this.audit.log({
      action: 'CONTAINMENT_STARTED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'IncidentTriage',
      entityId: triage.id,
    });

    return triage;
  }

  async update(incidentId: string, dto: UpdateTriageDto, actor: User): Promise<IncidentTriage> {
    const triage = await this.triageRepo.findOne({ where: { incidentId } });
    if (!triage) throw new NotFoundException(`Triage for incident ${incidentId} not found`);

    await this.triageRepo.update(triage.id, {
      ...dto,
      assignedToId: dto.assignedToId ?? triage.assignedToId,
    });

    await this.timeline.emit({
      incidentId,
      eventType: 'TRIAGE_UPDATED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Triage assessment updated`,
    });

    return this.triageRepo.findOneOrFail({ where: { incidentId } });
  }

  async get(incidentId: string): Promise<IncidentTriage | null> {
    return this.triageRepo.findOne({ where: { incidentId } });
  }
}
