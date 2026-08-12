import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, OptimisticLockVersionMismatchError } from 'typeorm';
import { IncidentCapa } from '../entities/incident-capa.entity';
import { IncidentCapaEvidence } from '../entities/incident-capa-evidence.entity';
import { IncidentService } from '../incidents/incident.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { AuditService } from '../../audit/audit.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { CreateCapaDto, UpdateCapaDto } from '../dto/incident-capa.dto';
import type { User } from '../../users/entities/user.entity';

/**
 * IncidentCapaService — manages Corrective and Preventive Actions.
 *
 * Lifecycle: PENDING → IN_PROGRESS → COMPLETED (→ goes to VERIFICATION)
 *                                  → REJECTED (by verifier)
 *                                  → REOPENED (after rejection)
 *
 * isOverdue flag is pre-computed by IncidentSlaService daily cron.
 * Overdue notification rules fire via the notification rule engine.
 */
@Injectable()
export class IncidentCapaService {
  private readonly logger = new Logger(IncidentCapaService.name);

  constructor(
    @InjectRepository(IncidentCapa)        private readonly capaRepo:     Repository<IncidentCapa>,
    @InjectRepository(IncidentCapaEvidence) private readonly evidenceRepo: Repository<IncidentCapaEvidence>,
    private readonly incidentService: IncidentService,
    private readonly timeline: IncidentTimelineService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(incidentId: string, dto: CreateCapaDto, actor: User): Promise<IncidentCapa> {
    await this.incidentService.findOne(incidentId);
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const capa = this.capaRepo.create({
      tenantId,
      incidentId,
      rcaId: dto.rcaId ?? null,
      title: dto.title,
      description: dto.description,
      capaType: dto.capaType,
      ownerId: dto.ownerId,
      ownerName: dto.ownerName ?? null,
      department: dto.department ?? null,
      dueDate: dto.dueDate,
      priorityCode: dto.priorityCode ?? 'MEDIUM',
      status: 'PENDING',
      createdById: actor.id,
    });

    const saved = await this.capaRepo.save(capa);

    await this.timeline.emit({
      incidentId,
      eventType: 'CAPA_ADDED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `CAPA added: "${dto.title}" (${dto.capaType}), due ${dto.dueDate}`,
      metadata: { capaId: saved.id, ownerId: dto.ownerId, dueDate: dto.dueDate },
    });

    await this.audit.log({
      action: 'CAPA_CREATED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'IncidentCapa',
      entityId: saved.id,
    });

    return saved;
  }

  async findAll(incidentId: string): Promise<IncidentCapa[]> {
    await this.incidentService.findOne(incidentId);
    return this.capaRepo.find({ where: { incidentId }, order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<IncidentCapa> {
    const capa = await this.capaRepo.findOne({ where: { id } });
    if (!capa) throw new NotFoundException(`CAPA ${id} not found`);
    return capa;
  }

  async update(incidentId: string, id: string, dto: UpdateCapaDto, actor: User): Promise<IncidentCapa> {
    const capa = await this.findOne(id);
    if (capa.incidentId !== incidentId) throw new ForbiddenException('CAPA does not belong to this incident');

    const wasNotCompleted = capa.status !== 'COMPLETED';
    const isNowCompleted = dto.status === 'COMPLETED';

    const payload = {
      ...dto,
      completedAt: isNowCompleted && wasNotCompleted ? new Date() : capa.completedAt,
    };
    
    const result = await this.capaRepo.update(
      { id, version: capa.version },
      payload,
    );

    if (result.affected === 0) {
      throw new OptimisticLockVersionMismatchError('IncidentCapa', capa.version, capa.version + 1);
    }

    if (isNowCompleted && wasNotCompleted) {
      await this.timeline.emit({
        incidentId,
        eventType: 'CAPA_STATUS_CHANGED',
        actorId: actor.id,
        actorName: actor.fullName ?? actor.username,
        description: `CAPA "${capa.title}" marked as COMPLETED`,
        metadata: { capaId: id, oldStatus: capa.status, newStatus: 'COMPLETED' },
      });

      // Check if all CAPAs for this incident are completed → transition to VERIFICATION
      await this.checkAndTransitionToVerification(incidentId, actor);
    }

    return this.findOne(id);
  }

  private async checkAndTransitionToVerification(incidentId: string, actor: User): Promise<void> {
    const allCapas = await this.capaRepo.find({ where: { incidentId } });
    const allCompleted = allCapas.every(c => c.status === 'COMPLETED' || c.status === 'REJECTED');
    const hasCompleted = allCapas.some(c => c.status === 'COMPLETED');

    if (allCompleted && hasCompleted) {
      try {
        await this.incidentService.transition(incidentId, 'VERIFICATION', actor, {
          reason: 'All CAPAs completed',
        });
      } catch (e) {
        this.logger.debug(`Could not auto-transition to VERIFICATION: ${e.message}`);
      }
    }
  }
}
