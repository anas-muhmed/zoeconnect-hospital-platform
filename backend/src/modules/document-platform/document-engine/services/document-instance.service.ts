import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocumentInstanceEntity, DocumentInstanceStatus } from '../entities/document-instance.entity';
import { DocumentLifecycleStateMachine } from '../lifecycle/state-machine';
import { DocumentCreatedEvent, DocumentStateChangedEvent } from '../../document-events/document.events';

export interface CreateInstanceInput {
  documentVersionId: string;
  branchId?: string | null;
  departmentCode?: string | null;
  patientId?: string | null;
  visitId?: string | null;
  encounterId?: string | null;
}

/**
 * DocumentInstanceService — generic fill/submit lifecycle for a published
 * document version (Milestone 4 "Runtime", ADR-001/ADR-002). Mirrors
 * DocumentService's Milestone 1 shape/conventions (direct
 * @InjectRepository, no repository-wrapper abstraction) applied to
 * document_instances instead of document_versions.
 *
 * Signatures (Wave 5) and branch/department override resolution (Milestone
 * 5, ADR-011) are explicitly NOT handled here — this service only manages
 * the raw answers/status lifecycle; FormsRuntimeService is where
 * schema-aware validation happens (this service doesn't know what a
 * FormSchema is, deliberately, to stay a generic Document Engine primitive).
 */
@Injectable()
export class DocumentInstanceService {
  constructor(
    @InjectRepository(DocumentInstanceEntity)
    private readonly instanceRepo: Repository<DocumentInstanceEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createInstance(input: CreateInstanceInput): Promise<DocumentInstanceEntity> {
    const entity = this.instanceRepo.create({
      documentVersionId: input.documentVersionId,
      branchId: input.branchId ?? null,
      departmentCode: input.departmentCode ?? null,
      patientId: input.patientId ?? null,
      visitId: input.visitId ?? null,
      encounterId: input.encounterId ?? null,
      answers: {},
      status: 'draft',
    });
    const saved = await this.instanceRepo.save(entity);

    this.eventEmitter.emit(
      'document.created',
      new DocumentCreatedEvent(saved.id, saved.documentVersionId, 'system') // actor is system unless provided
    );

    return saved;
  }

  async getInstance(id: string): Promise<DocumentInstanceEntity> {
    const instance = await this.instanceRepo.findOne({ where: { id } });
    if (!instance) throw new NotFoundException(`Document instance ${id} not found`);
    return instance;
  }

  /**
   * Merges new answers into the instance (autosave, Milestone 4). Only
   * permitted while 'in_progress' — once finalized, answers are immutable
   * (mirrors ADR-001's draft-immutability pattern applied to instances).
   */
  async saveAnswers(id: string, answers: Record<string, unknown>, expectedVersion: number): Promise<DocumentInstanceEntity> {
    const instance = await this.getInstance(id);
    if (instance.status !== 'in_progress' && instance.status !== 'draft') {
      throw new ConflictException(`Instance ${id} is not in_progress (status: ${instance.status}); answers are immutable once finalized.`);
    }
    if (instance.version !== expectedVersion) {
      throw new ConflictException(`Optimistic concurrency conflict: Expected version ${expectedVersion} but got ${instance.version}`);
    }

    let transitionedFromDraft = false;
    let oldStatus = instance.status;
    if (instance.status === 'draft') {
      DocumentLifecycleStateMachine.validateTransition(instance.status, 'in_progress');
      instance.status = 'in_progress';
      transitionedFromDraft = true;
    }
    
    instance.answers = { ...instance.answers, ...answers };
    const saved = await this.instanceRepo.save(instance);

    if (transitionedFromDraft) {
      this.eventEmitter.emit(
        'document.state_changed',
        new DocumentStateChangedEvent(saved.id, oldStatus, 'in_progress', 'system')
      );
    }

    return saved;
  }

  async transitionStatus(
    instance: DocumentInstanceEntity, 
    newStatus: DocumentInstanceStatus, 
    actorId: string,
    action?: string,
    skipValidation = false
  ): Promise<DocumentInstanceEntity> {
    if (!skipValidation) {
      DocumentLifecycleStateMachine.validateTransition(instance.status, newStatus);
    }
    const oldStatus = instance.status;
    instance.status = newStatus;
    
    const saved = await this.instanceRepo.save(instance);
    
    this.eventEmitter.emit(
      'document.state_changed',
      new DocumentStateChangedEvent(saved.id, oldStatus, newStatus, actorId, action)
    );
    
    return saved;
  }

  /**
   * Finalizes an instance (the "Submit" action). Caller (FormsRuntimeService)
   * is responsible for running schema validation BEFORE calling this —
   * this method only enforces the status-transition invariant, since it has
   * no knowledge of FormSchema/validation rules (generic Document Engine
   * primitive, not a forms-specific one).
   */
  async finalizeInstance(id: string, submittedBy: string, expectedVersion: number): Promise<DocumentInstanceEntity> {
    const instance = await this.getInstance(id);
    if (instance.status !== 'in_progress') {
      throw new ConflictException(`Instance ${id} cannot be finalized because its status is ${instance.status}`);
    }
    if (instance.version !== expectedVersion) {
      throw new ConflictException(`Optimistic concurrency conflict: Expected version ${expectedVersion} but got ${instance.version}`);
    }
    
    instance.submittedBy = submittedBy;
    return this.transitionStatus(instance, 'completed', submittedBy);
  }
}
