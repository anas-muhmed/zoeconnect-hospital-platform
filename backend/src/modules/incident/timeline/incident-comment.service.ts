import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { IncidentComment } from '../entities/incident-comment.entity';
import { IncidentService } from '../incidents/incident.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { User } from '../../users/entities/user.entity';
import { CreateIncidentCommentDto } from '../dto/incident-comment.dto';
import { IncidentCommentAddedEvent } from '../domain/events/incident-events';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';

@Injectable()
export class IncidentCommentService {
  private readonly logger = new Logger(IncidentCommentService.name);

  constructor(
    @InjectRepository(IncidentComment)
    private readonly repo: Repository<IncidentComment>,
    @Inject(getTenantScopedRepositoryToken(IncidentComment))
    private readonly scopedRepo: TenantScopedRepository<IncidentComment>,
    private readonly incidentService: IncidentService,
    private readonly tenantContext: TenantContextStorage,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async addComment(incidentId: string, dto: CreateIncidentCommentDto, actor: User): Promise<IncidentComment> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    
    // Validate incident exists and is accessible
    const incident = await this.incidentService.findOne(incidentId);

    const comment = this.repo.create({
      tenantId,
      incidentId,
      authorId: actor.id,
      authorName: actor.fullName ?? actor.username,
      content: dto.content,
      visibility: dto.visibility ?? 'INTERNAL',
    });

    const saved = await this.repo.save(comment);

    // Emit Domain Event
    const event = new IncidentCommentAddedEvent(
      crypto.randomUUID(),
      crypto.randomUUID(), // New interaction chain gets a new correlationId
      tenantId,
      new Date(),
      actor.id,
      incidentId,
      incident.version,
      saved.id,
      saved.visibility,
    );

    this.eventEmitter.emit('incident.comment.added', event);

    return saved;
  }

  async getComments(incidentId: string): Promise<IncidentComment[]> {
    // Validate incident access first
    await this.incidentService.findOne(incidentId);

    return this.scopedRepo.find({
      where: { incidentId },
      order: { createdAt: 'ASC' },
    });
  }
}
