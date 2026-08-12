import {
  Inject, Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EicGoal } from '../entities/eic-goal.entity';
import { AuditService } from '../../audit/audit.service';
import { EicGoalStatus, EicGoalType } from '../common/enums/assessment-status.enum';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface CreateGoalDto {
  assessmentId: string;
  discipline: EicDiscipline;
  goalType?: EicGoalType;
  goalText: string;
  targetDate?: string;
  displayOrder?: number;
}

@Injectable()
export class EicGoalService {
  private readonly logger = new Logger(EicGoalService.name);

  constructor(
    @InjectRepository(EicGoal)
    private readonly goalRepo: Repository<EicGoal>,
    private readonly auditService: AuditService,

    /**
     * Stage B (Checkpoint B3.5) — scoped repository for `findByEnrollment()`/
     * `findById()` only. Every write path stays on `goalRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(EicGoal))
    private readonly scopedGoalRepo: TenantScopedRepository<EicGoal>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(enrollmentId: string, dto: CreateGoalDto, actorId: string): Promise<EicGoal> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const goal = this.goalRepo.create({
      enrollmentId,
      assessmentId:  dto.assessmentId,
      discipline:    dto.discipline,
      goalType:      dto.goalType ?? EicGoalType.SHORT_TERM,
      goalText:      dto.goalText,
      targetDate:    dto.targetDate ?? null,
      displayOrder:  dto.displayOrder ?? 0,
      createdBy:     actorId,
      tenantId,
    });

    const saved = await this.goalRepo.save(goal);

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_GOAL_CREATED',
      entityType: 'eic_goals',
      entityId:   saved.id,
      userId: actorId,
      metadata:   { enrollmentId, discipline: dto.discipline },
    });

    return saved;
  }

  async findByEnrollment(enrollmentId: string, discipline?: EicDiscipline): Promise<EicGoal[]> {
    const where: any = { enrollmentId };
    if (discipline) where.discipline = discipline;

    const goals = await this.scopedGoalRepo.find({
      where,
      order: { discipline: 'ASC', displayOrder: 'ASC', createdAt: 'ASC' },
    });
    // A5.5 API Contract Audit: backs GET /eic/enrollments/:enrollmentId/goals.
    goals.forEach((g) => delete (g as { tenantId?: string | null }).tenantId);
    return goals;
  }

  async findById(id: string): Promise<EicGoal> {
    const goal = await this.scopedGoalRepo.findOne({ where: { id } });
    if (!goal) throw new NotFoundException(`Goal ${id} not found`);
    return goal;
  }

  async update(
    id: string,
    data: Partial<Pick<EicGoal, 'goalText' | 'targetDate' | 'displayOrder'>>,
    actorId: string,
  ): Promise<EicGoal> {
    await this.findById(id);
    await this.goalRepo.update(id, data);
    return this.findById(id);
  }

  async achieve(id: string, notes: string, actorId: string): Promise<EicGoal> {
    const goal = await this.findById(id);

    if (goal.status !== EicGoalStatus.ACTIVE) {
      throw new BadRequestException(`Goal is already in ${goal.status} state`);
    }

    await this.goalRepo.update(id, {
      status:           EicGoalStatus.ACHIEVED,
      achievedAt:       new Date(),
      achievementNotes: notes,
    });

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_GOAL_ACHIEVED',
      entityType: 'eic_goals',
      entityId:   id,
      userId: actorId,
      metadata:   { goalText: goal.goalText },
    });

    return this.findById(id);
  }

  async discontinue(id: string, actorId: string): Promise<EicGoal> {
    const goal = await this.findById(id);
    await this.goalRepo.update(id, { status: EicGoalStatus.DISCONTINUED });
    return this.findById(id);
  }


  async extend(
    id: string,
    newTargetDate: string,
    remarks: string,
    actorId: string,
  ): Promise<EicGoal> {
    const goal = await this.findById(id);

    if (goal.status !== EicGoalStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE goals can have their target date extended');
    }
    if (!goal.targetDate && !goal.extendedTargetDate) {
      throw new BadRequestException('Goal has no target date set — set a target date before extending');
    }

    // Preserve the original target date on first extension
    const originalTargetDate = goal.originalTargetDate ?? goal.targetDate;

    await this.goalRepo.update(id, {
      originalTargetDate,
      extendedTargetDate: newTargetDate,
      extensionRemarks:   remarks,
      extendedAt:         new Date(),
      extendedBy:         actorId,
      // Update targetDate so downstream session/report logic sees the new date
      targetDate: newTargetDate,
    });

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_GOAL_EXTENDED',
      entityType: 'eic_goals',
      entityId:   id,
      userId:     actorId,
      metadata:   { originalTargetDate, newTargetDate, remarks },
    });

    return this.findById(id);
  }

  /** Increment session count for a goal (called when session entry references it) */
  async incrementSessionCount(id: string): Promise<void> {
    await this.goalRepo.increment({ id }, 'sessionCount', 1);
  }
}
