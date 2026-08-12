import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentAuditTrailEntity } from '../../document-engine/entities/document-audit-trail.entity';
import { WorkflowTemplateEntity } from '../entities/workflow-template.entity';

export interface TimelineEvent {
  state: string;
  action: string;
  actorId: string;
  actorType: string;
  timestamp: Date;
  count?: number; // Added to represent grouped events
}

@Injectable()
export class WorkflowTimelineService {
  constructor(
    @InjectRepository(DocumentAuditTrailEntity)
    private readonly auditRepo: Repository<DocumentAuditTrailEntity>,
    @InjectRepository(WorkflowTemplateEntity)
    private readonly templateRepo: Repository<WorkflowTemplateEntity>
  ) {}

  /**
   * Projects raw audit logs into a high-level visual timeline for a document instance.
   */
  async getTimeline(instanceId: string, documentTypeId: string): Promise<{ expectedWorkflow: string[], timeline: TimelineEvent[] }> {
    const logs = await this.auditRepo.find({
      where: { instanceId },
      order: { createdAt: 'ASC' },
    });

    const timeline: TimelineEvent[] = [];

    for (const log of logs) {
      let newEvent: TimelineEvent | null = null;
      
      if (log.action === 'STATE_CHANGED' && log.afterState) {
        newEvent = {
          state: (log.afterState.status as string) || 'unknown',
          action: (log.details?.action as string) || 'State Transition', 
          actorId: log.actorId || 'system',
          actorType: log.actorType,
          timestamp: log.createdAt,
        };
      } else if (log.action === 'DOCUMENT_CREATED') {
        newEvent = {
          state: 'draft', // Assumed initial state
          action: 'Created',
          actorId: log.actorId || 'system',
          actorType: log.actorType,
          timestamp: log.createdAt,
        };
      } else if (log.action === 'DOCUMENT_UPDATED') {
        newEvent = {
          state: (log.afterState?.status as string) || 'draft',
          action: 'Edited',
          actorId: log.actorId || 'system',
          actorType: log.actorType,
          timestamp: log.createdAt,
        };
      } else if (log.action === 'FINALIZED') {
        newEvent = {
          state: 'finalized',
          action: 'Finalized',
          actorId: log.actorId || 'system',
          actorType: log.actorType,
          timestamp: log.createdAt,
        };
      }

      if (newEvent) {
        const lastEvent = timeline[timeline.length - 1];
        if (
          lastEvent &&
          lastEvent.action === newEvent.action &&
          lastEvent.actorId === newEvent.actorId &&
          lastEvent.state === newEvent.state
        ) {
          lastEvent.count = (lastEvent.count || 1) + 1;
          lastEvent.timestamp = newEvent.timestamp; // keep the latest timestamp
        } else {
          timeline.push({ ...newEvent, count: 1 });
        }
      }
    }

    const template = await this.templateRepo.findOne({
      where: { documentTypeId, status: 'published' },
      order: { versionNo: 'DESC' },
    });

    let expectedWorkflow: string[] = [];
    if (template && template.definition.states) {
      // Just extract a linear representation if possible, or all known states
      expectedWorkflow = template.definition.states.map(s => s.name);
    }

    return {
      expectedWorkflow,
      timeline,
    };
  }
}
