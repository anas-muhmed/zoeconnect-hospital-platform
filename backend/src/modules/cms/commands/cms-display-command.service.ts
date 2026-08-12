import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CMSDisplayCommand, CmsCommandType } from '../entities/cms-display-command.entity';
import { CMSDisplayAssignment } from '../entities/cms-display-assignment.entity';
import { CmsAuditService } from '../audit/cms-audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

/** PAUSE/RESUME are pure state flips (reflected instantly via active-content's isPaused field)
 *  and are auto-acknowledged; the other four require the player to actively do something on
 *  its next poll, so they stay PENDING until the player calls the ack endpoint. */
const INSTANT_COMMANDS = new Set<CmsCommandType>(['PAUSE', 'RESUME']);

@Injectable()
export class CmsDisplayCommandService {
  constructor(
    @InjectRepository(CMSDisplayCommand)
    private readonly commandRepo: Repository<CMSDisplayCommand>,
    @InjectRepository(CMSDisplayAssignment)
    private readonly assignmentRepo: Repository<CMSDisplayAssignment>,
    private readonly auditService: CmsAuditService,

    /**
     * Stage B (Checkpoint B3.6) — scoped repository for `listHistory()`
     * only. `listPending()` stays raw — chain-resolved, reached exclusively
     * from the anonymous `GET player/:slug/commands` route, deferred to B5.
     * Every write path stays raw too.
     */
    @Inject(getTenantScopedRepositoryToken(CMSDisplayCommand))
    private readonly scopedCommandRepo: TenantScopedRepository<CMSDisplayCommand>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async issue(displayAssignmentId: string, commandType: CmsCommandType, createdBy: string): Promise<CMSDisplayCommand> {
    const assignment = await this.assignmentRepo.findOne({ where: { id: displayAssignmentId } });
    if (!assignment) throw new NotFoundException(`Display assignment "${displayAssignmentId}" not found`);

    const isInstant = INSTANT_COMMANDS.has(commandType);
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const command = this.commandRepo.create({
      displayAssignmentId,
      commandType,
      createdBy,
      status: isInstant ? 'ACKNOWLEDGED' : 'PENDING',
      acknowledgedAt: isInstant ? new Date() : null,
      tenantId,
    });
    const saved = await this.commandRepo.save(command);

    if (commandType === 'PAUSE' || commandType === 'RESUME') {
      assignment.isPaused = commandType === 'PAUSE';
      await this.assignmentRepo.save(assignment);
    }

    await this.auditService.log({
      entityType: 'CMSDisplayAssignment', entityId: displayAssignmentId, action: 'UPDATE',
      changedBy: createdBy, summary: `Issued remote command ${commandType} to "${assignment.name}"`,
    });
    return saved;
  }

  /** Issues a command to every active display carrying at least one of the given tags. */
  async issueByTags(tags: string[], commandType: CmsCommandType, createdBy: string): Promise<CMSDisplayCommand[]> {
    if (tags.length === 0) return [];
    const displays = await this.assignmentRepo
      .createQueryBuilder('d')
      .where('d.isActive = true')
      .andWhere('d.tags && :tags', { tags })
      .getMany();

    const results: CMSDisplayCommand[] = [];
    for (const display of displays) {
      results.push(await this.issue(display.id, commandType, createdBy));
    }
    return results;
  }

  // A5.5 API Contract Audit: reached exclusively from the anonymous
  // `GET player/:slug/commands` route -- no select/DTO here previously meant
  // raw CMSDisplayCommand rows (including tenantId) went straight to
  // unauthenticated player traffic. Explicit select excludes tenantId.
  async listPending(displayAssignmentId: string): Promise<CMSDisplayCommand[]> {
    return this.commandRepo.find({
      where: { displayAssignmentId, status: 'PENDING' },
      order: { createdAt: 'ASC' },
      select: ['id', 'displayAssignmentId', 'commandType', 'status', 'createdBy', 'createdAt', 'acknowledgedAt'],
    });
  }

  // A5.5 API Contract Audit: admin GET :displayId/history -- same leak, session-authenticated.
  async listHistory(displayAssignmentId: string, limit = 50): Promise<CMSDisplayCommand[]> {
    return this.scopedCommandRepo.find({
      where: { displayAssignmentId },
      order: { createdAt: 'DESC' },
      take: limit,
      select: ['id', 'displayAssignmentId', 'commandType', 'status', 'createdBy', 'createdAt', 'acknowledgedAt'],
    });
  }

  async acknowledge(id: string): Promise<CMSDisplayCommand> {
    const command = await this.commandRepo.findOne({ where: { id } });
    if (!command) throw new NotFoundException(`Command "${id}" not found`);
    command.status = 'ACKNOWLEDGED';
    command.acknowledgedAt = new Date();
    return this.commandRepo.save(command);
  }

  async acknowledgeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.commandRepo.update({ id: In(ids) }, { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() });
  }
}
