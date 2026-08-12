import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentAuditTrailEntity } from '../entities/document-audit-trail.entity';
import { 
  DocumentCreatedEvent, 
  DocumentStateChangedEvent, 
  DocumentAutosavedEvent, 
  DocumentFinalizedEvent, 
  SnapshotGeneratedEvent 
} from '../../document-events/document.events';

@Injectable()
export class AuditTrailListener {
  constructor(
    @InjectRepository(DocumentAuditTrailEntity)
    private readonly auditRepo: Repository<DocumentAuditTrailEntity>,
  ) {}

  @OnEvent('document.created')
  async handleDocumentCreatedEvent(event: DocumentCreatedEvent) {
    await this.auditRepo.save(this.auditRepo.create({
      instanceId: event.instanceId,
      action: 'DOCUMENT_CREATED',
      actorType: 'system', // or from event if we had it
      actorId: event.actorId,
      source: 'api',
      details: { documentVersionId: event.documentVersionId },
    }));
  }

  @OnEvent('document.state_changed')
  async handleDocumentStateChangedEvent(event: DocumentStateChangedEvent) {
    await this.auditRepo.save(this.auditRepo.create({
      instanceId: event.instanceId,
      action: 'STATE_CHANGED',
      actorType: 'user', // Simplified
      actorId: event.actorId,
      correlationId: event.correlationId,
      beforeState: { status: event.oldState },
      afterState: { status: event.newState },
    }));
  }

  @OnEvent('document.autosaved')
  async handleDocumentAutosavedEvent(event: DocumentAutosavedEvent) {
    await this.auditRepo.save(this.auditRepo.create({
      instanceId: event.instanceId,
      action: 'AUTOSAVED',
      actorType: 'system',
      actorId: event.actorId,
      details: { revision: event.revision },
    }));
  }

  @OnEvent('document.finalized')
  async handleDocumentFinalizedEvent(event: DocumentFinalizedEvent) {
    await this.auditRepo.save(this.auditRepo.create({
      instanceId: event.instanceId,
      action: 'FINALIZED',
      actorType: 'user',
      actorId: event.actorId,
    }));
  }

  @OnEvent('document.snapshot_generated')
  async handleSnapshotGeneratedEvent(event: SnapshotGeneratedEvent) {
    await this.auditRepo.save(this.auditRepo.create({
      instanceId: event.instanceId,
      action: 'SNAPSHOT_GENERATED',
      actorType: 'system',
      actorId: 'system',
      details: { snapshotId: event.snapshotId },
    }));
  }
}
