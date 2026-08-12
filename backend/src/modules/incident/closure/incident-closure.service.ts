import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentClosure } from '../entities/incident-closure.entity';
import { IncidentRiskMatrixConfig } from '../entities/incident-risk-matrix-config.entity';
import { IncidentService } from '../incidents/incident.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { AuditService } from '../../audit/audit.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { CloseIncidentDto } from '../dto/incident-closure.dto';
import type { User } from '../../users/entities/user.entity';

/**
 * IncidentClosureService — manages the formal closure of an incident.
 *
 * Closure requires INCIDENT:INCIDENTS:CLOSE permission (permission-gated
 * at the controller level). This service validates that the incident
 * is in a closeable state and records the final assessment.
 *
 * Final risk score: computed from finalLikelihood × finalImpact
 * using the risk matrix. If not provided, uses the existing riskScore.
 *
 * Lessons learned: stored in incident_closure.lessons_learned and
 * available for the organizational learning dashboard query.
 */
@Injectable()
export class IncidentClosureService {
  private readonly logger = new Logger(IncidentClosureService.name);

  constructor(
    @InjectRepository(IncidentClosure)
    private readonly closureRepo: Repository<IncidentClosure>,
    @InjectRepository(IncidentRiskMatrixConfig)
    private readonly riskRepo: Repository<IncidentRiskMatrixConfig>,
    private readonly incidentService: IncidentService,
    private readonly timeline: IncidentTimelineService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async close(incidentId: string, dto: CloseIncidentDto, actor: User): Promise<IncidentClosure> {
    const incident = await this.incidentService.findOne(incidentId);

    const existingClosure = await this.closureRepo.findOne({ where: { incidentId } });
    if (existingClosure) {
      throw new BadRequestException('Incident is already closed');
    }

    // Compute final risk score
    let finalRiskScore: number | null = null;
    let finalRiskLevel: string | null = null;
    if (dto.finalLikelihood && dto.finalImpact) {
      const matrix = await this.riskRepo.findOne({
        where: { likelihood: dto.finalLikelihood, impact: dto.finalImpact },
      });
      finalRiskScore = matrix?.riskScore ?? dto.finalLikelihood * dto.finalImpact;
      finalRiskLevel = matrix?.riskLevel ?? 'MEDIUM';

      // Update post-CAPA residual risk on incident
      await this.incidentService.updateResidualRisk(
        incidentId,
        { likelihood: dto.finalLikelihood, impact: dto.finalImpact, stage: 'POST_CAPA' },
        actor,
      );
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const closure = this.closureRepo.create({
      tenantId,
      incidentId,
      closureNotes: dto.closureNotes,
      lessonsLearned: dto.lessonsLearned ?? null,
      finalRiskScore,
      finalRiskLevel,
      residualRiskAccepted: dto.residualRiskAccepted ?? false,
      residualRiskNotes: dto.residualRiskNotes ?? null,
      closedById: actor.id,
      approvedById: dto.approvedById ?? null,
      closedAt: new Date(),
    });

    const saved = await this.closureRepo.save(closure);

    // Transition to CLOSED
    await this.incidentService.transition(incidentId, 'CLOSED', actor, {
      closureId: saved.id,
    });

    await this.timeline.emit({
      incidentId,
      eventType: 'INCIDENT_CLOSED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Incident formally closed. Final risk: ${finalRiskLevel ?? 'N/A'}. Lessons: ${dto.lessonsLearned ? 'Yes' : 'No'}`,
      metadata: { closureId: saved.id, finalRiskScore, finalRiskLevel, residualRiskAccepted: dto.residualRiskAccepted },
    });

    await this.audit.log({
      action: 'INCIDENT_CLOSED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'Incident',
      entityId: incidentId,
      newValue: { finalRiskScore, finalRiskLevel, closureId: saved.id } as Record<string, unknown>,
    });

    return saved;
  }

  async getClosure(incidentId: string): Promise<IncidentClosure | null> {
    return this.closureRepo.findOne({ where: { incidentId } });
  }
}
