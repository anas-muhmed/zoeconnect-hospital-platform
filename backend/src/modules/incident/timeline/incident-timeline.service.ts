import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentTimelineEvent } from '../entities/incident-timeline-event.entity';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

/**
 * IncidentTimelineService — writes immutable timeline events.
 *
 * Every significant action in the incident lifecycle calls emit().
 * Events are written directly (not queued) to ensure they are
 * committed atomically with the action that triggered them.
 *
 * Standard event types:
 *   INCIDENT_CREATED, INCIDENT_SUBMITTED, INCIDENT_ACKNOWLEDGED,
 *   INCIDENT_ASSIGNED, TRIAGE_COMPLETED, TRIAGE_UPDATED,
 *   CONTAINMENT_NOTED, INVESTIGATION_STARTED, INVESTIGATION_COMPLETED,
 *   RCA_STARTED, RCA_COMPLETED, CAPA_ADDED, CAPA_STATUS_CHANGED,
 *   VERIFICATION_APPROVED, VERIFICATION_REJECTED, INCIDENT_CLOSED,
 *   INCIDENT_REOPENED, ATTACHMENT_ADDED, ATTACHMENT_DELETED,
 *   SLA_RESPONSE_BREACHED, SLA_CLOSURE_BREACHED, STATUS_CHANGED,
 *   NOTE_ADDED, RESIDUAL_RISK_UPDATED
 */
@Injectable()
export class IncidentTimelineService {
  private readonly logger = new Logger(IncidentTimelineService.name);

  constructor(
    @InjectRepository(IncidentTimelineEvent)
    private readonly eventRepo: Repository<IncidentTimelineEvent>,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async emit(opts: {
    incidentId: string;
    eventType: string;
    actorId?: string;
    actorName?: string;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const event = this.eventRepo.create({
      incidentId:  opts.incidentId,
      tenantId,
      eventType:   opts.eventType,
      actorId:     opts.actorId ?? null,
      actorName:   opts.actorName ?? null,
      description: opts.description,
      metadata:    opts.metadata ?? null,
      occurredAt:  new Date(),
    });
    await this.eventRepo.save(event);
    this.logger.debug(`[Timeline] ${opts.eventType} on incident ${opts.incidentId}`);
  }

  async getForIncident(incidentId: string): Promise<IncidentTimelineEvent[]> {
    return this.eventRepo.find({
      where: { incidentId },
      order: { occurredAt: 'ASC' },
    });
  }
}
