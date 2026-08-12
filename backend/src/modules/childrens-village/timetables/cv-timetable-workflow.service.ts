import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { WorkflowDefinition, WorkflowAssignment } from '../../document-platform/workflow-engine/models/workflow-definition';
import { CvTimetableWorkflowTemplate, CvWorkflowTemplateStatus } from './entities/cv-timetable-workflow-template.entity';
import { CvTimetableWorkflowInstance } from './entities/cv-timetable-workflow-instance.entity';
import { CvTimetableWorkflowTask, CvWorkflowApproverType } from './entities/cv-timetable-workflow-task.entity';
import { CvTimetableApprovalConfigService } from './cv-timetable-approval-config.service';
import { CvClass } from '../classes/entities/cv-class.entity';
import { CvTimetable } from './entities/cv-timetable.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

/** Emitted when a workflow instance reaches a terminal outcome. Listened to by CvTimetableApprovalCompletionListener. */
export const CV_TIMETABLE_APPROVAL_COMPLETED_EVENT = 'cv.timetable.approval.completed';
export interface CvTimetableApprovalCompletedPayload {
  instanceId: string;
  sourceType: string;
  sourceId: string;
  outcome: 'APPROVED' | 'REJECTED';
  actorId: string;
}

export interface CvStartApprovalResult {
  required: boolean;
  instanceId?: string;
}

export class CreateWorkflowTemplateDto {
  name: string;
  changeType: string;
  definition: WorkflowDefinition;
}

/**
 * Timetable Management Phase 6 -- Workflow Integration.
 *
 * Reuses document-platform's `WorkflowDefinition` DSL shape (imported
 * type-only) but drives it with entirely new orchestration code against
 * CV's own tenant-scoped tables -- see the Phase 6 migration's header
 * comment for why direct reuse of `WorkflowEngineService`/
 * `TaskEngineService`/their tables was not safe.
 *
 * CV's resolver supports a practical subset of the DSL: purely linear
 * traversal (no `condition`/RuleEngine evaluation -- the first transition
 * matching `from`+`action` always wins), `action` fixed to
 * `'approve'`/`'reject'`, and `assignTo` limited to `userIds[0]`
 * (SPECIFIC_USER), `roles: ['CLASS_TEACHER_OF_RECORD']` (resolved via
 * `CvClass.classTeacherId`), or `roles: ['ADMIN']` (resolved by permission
 * at completion time, not a stored identity). This covers the brief's
 * Single/Two-Level/Multi-Level approval requirement exactly, since those
 * are linear N-step chains by definition -- it deliberately does not
 * implement branching/conditional workflows, which nothing in this domain
 * currently needs.
 */
@Injectable()
export class CvTimetableWorkflowService {
  constructor(
    @InjectRepository(CvTimetableWorkflowTemplate)
    private readonly templateWriteRepo: Repository<CvTimetableWorkflowTemplate>,
    @InjectRepository(CvTimetableWorkflowInstance)
    private readonly instanceWriteRepo: Repository<CvTimetableWorkflowInstance>,
    @InjectRepository(CvTimetableWorkflowTask)
    private readonly taskWriteRepo: Repository<CvTimetableWorkflowTask>,

    @Inject(getTenantScopedRepositoryToken(CvTimetableWorkflowTemplate))
    private readonly templateReadRepo: TenantScopedRepository<CvTimetableWorkflowTemplate>,
    @Inject(getTenantScopedRepositoryToken(CvTimetableWorkflowInstance))
    private readonly instanceReadRepo: TenantScopedRepository<CvTimetableWorkflowInstance>,
    @Inject(getTenantScopedRepositoryToken(CvTimetableWorkflowTask))
    private readonly taskReadRepo: TenantScopedRepository<CvTimetableWorkflowTask>,
    @Inject(getTenantScopedRepositoryToken(CvClass))
    private readonly classReadRepo: TenantScopedRepository<CvClass>,
    @Inject(getTenantScopedRepositoryToken(CvTimetable))
    private readonly timetableReadRepo: TenantScopedRepository<CvTimetable>,

    private readonly approvalConfigService: CvTimetableApprovalConfigService,
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Templates ──────────────────────────────────────────────────────

  async createTemplate(dto: CreateWorkflowTemplateDto, actorId: string): Promise<CvTimetableWorkflowTemplate> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    this.validateDefinitionShape(dto.definition);

    const template = this.templateWriteRepo.create({
      tenantId,
      name: dto.name,
      changeType: dto.changeType,
      definition: dto.definition,
      status: 'draft',
      createdBy: actorId,
      updatedBy: actorId,
    });
    const saved = await this.templateWriteRepo.save(template);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_WORKFLOW_TEMPLATE_CREATED',
      entityType: 'cv_timetable_workflow_templates',
      entityId: saved.id,
      userId: actorId,
      metadata: { name: dto.name, changeType: dto.changeType },
    });

    return saved;
  }

  async publishTemplate(actorId: string, id: string): Promise<CvTimetableWorkflowTemplate> {
    const template = await this.templateReadRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException(`Workflow template ${id} not found`);
    if (template.status !== 'draft') {
      throw new BadRequestException(`Cannot publish a template that is '${template.status}'`);
    }

    template.status = 'published';
    template.updatedBy = actorId;
    const saved = await this.templateWriteRepo.save(template);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_WORKFLOW_TEMPLATE_PUBLISHED',
      entityType: 'cv_timetable_workflow_templates',
      entityId: saved.id,
      userId: actorId,
    });

    return saved;
  }

  async listTemplates(changeType?: string): Promise<CvTimetableWorkflowTemplate[]> {
    return this.templateReadRepo.find({
      where: changeType ? { changeType } : {},
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Fails loudly on an obviously-broken definition (no states, no
   * transitions, or a non-terminal first state with no outgoing
   * transitions) rather than accepting it and discovering the problem
   * later when `startApproval` can't walk it -- matches the design spec's
   * own "the engine must fail loudly, not silently skip, if a resolved
   * approver set is empty" principle.
   */
  private validateDefinitionShape(definition: WorkflowDefinition): void {
    if (!definition.states?.length) throw new BadRequestException('Workflow definition must have at least one state');
    if (!definition.transitions?.length) throw new BadRequestException('Workflow definition must have at least one transition');
    const firstState = definition.states[0];
    if (firstState.isTerminal) throw new BadRequestException('The first state cannot be terminal');
    const hasOutgoing = definition.transitions.some((t) => t.from === firstState.id && t.action === 'approve');
    if (!hasOutgoing) {
      throw new BadRequestException(`No 'approve' transition found out of the initial state '${firstState.id}'`);
    }
  }

  // ── Approval lifecycle ─────────────────────────────────────────────

  /**
   * Called by `CvTimetableLifecycleService.publish()` before it actually
   * publishes. Returns `{ required: false }` (no instance created) when
   * `cv_timetable_approval_config` has no row, or `approvalMode:
   * 'DISABLED'`, for this `changeType` -- this is what preserves Phase
   * 2's original unconditional-publish behavior for any tenant that
   * hasn't configured approval, i.e. zero regression by default.
   */
  async startApproval(
    actorId: string,
    sourceType: string,
    sourceId: string,
    changeType: string,
    classId?: string,
  ): Promise<CvStartApprovalResult> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const config = await this.approvalConfigService.getEffectiveConfig(changeType);
    if (!config || config.approvalMode === 'DISABLED') {
      return { required: false };
    }
    if (!config.workflowTemplateId) {
      throw new BadRequestException(
        `Approval is configured as '${config.approvalMode}' for change type '${changeType}' but no workflow template is set`,
      );
    }

    const template = await this.templateReadRepo.findOne({ where: { id: config.workflowTemplateId, status: 'published' } });
    if (!template) {
      throw new BadRequestException(`No published workflow template found for change type '${changeType}'`);
    }

    const resolvedClassId = classId ?? (sourceType === 'TIMETABLE_PUBLISH' ? (await this.timetableReadRepo.findOne({ where: { id: sourceId } }))?.classId : undefined);

    const initialState = template.definition.states[0];
    const instance = this.instanceWriteRepo.create({
      tenantId,
      workflowTemplateId: template.id,
      sourceType,
      sourceId,
      classId: resolvedClassId ?? null,
      currentState: initialState.id,
      status: 'active',
      initiatedBy: actorId,
      startedAt: new Date(),
    });
    const savedInstance = await this.instanceWriteRepo.save(instance);

    await this.createTaskForCurrentState(savedInstance, template.definition, actorId);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_APPROVAL_STARTED',
      entityType: 'cv_timetable_workflow_instances',
      entityId: savedInstance.id,
      userId: actorId,
      metadata: { sourceType, sourceId, changeType, templateId: template.id },
    });

    return { required: true, instanceId: savedInstance.id };
  }

  private async createTaskForCurrentState(
    instance: CvTimetableWorkflowInstance,
    definition: WorkflowDefinition,
    actorId: string,
  ): Promise<CvTimetableWorkflowTask> {
    const transition = definition.transitions.find((t) => t.from === instance.currentState && t.action === 'approve');
    if (!transition || !transition.assignTo) {
      throw new BadRequestException(`No approve transition/assignment configured for state '${instance.currentState}'`);
    }

    const assignment = Array.isArray(transition.assignTo) ? transition.assignTo[0] : transition.assignTo;
    const { approverType, approverValue, assignedUserId } = await this.resolveAssignment(assignment, instance);

    const task = this.taskWriteRepo.create({
      tenantId: instance.tenantId,
      hospitalId: instance.hospitalId,
      instanceId: instance.id,
      workflowState: instance.currentState,
      approverType,
      approverValue,
      assignedUserId,
      status: 'pending',
    });
    const saved = await this.taskWriteRepo.save(task);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_APPROVAL_TASK_CREATED',
      entityType: 'cv_timetable_workflow_tasks',
      entityId: saved.id,
      userId: actorId,
      metadata: { instanceId: instance.id, workflowState: instance.currentState, approverType, assignedUserId },
    });

    return saved;
  }

  private async resolveAssignment(
    assignment: WorkflowAssignment,
    instance: CvTimetableWorkflowInstance,
  ): Promise<{ approverType: CvWorkflowApproverType; approverValue: string | null; assignedUserId: string | null }> {
    if (assignment.userIds?.length) {
      return { approverType: 'SPECIFIC_USER', approverValue: assignment.userIds[0], assignedUserId: assignment.userIds[0] };
    }
    if (assignment.roles?.includes('CLASS_TEACHER_OF_RECORD')) {
      if (!instance.classId) throw new BadRequestException('CLASS_TEACHER_OF_RECORD assignment requires a class context');
      const cvClass = await this.classReadRepo.findOne({ where: { id: instance.classId } });
      if (!cvClass?.classTeacherId) {
        throw new BadRequestException('This class has no Main Class Teacher assigned -- cannot resolve CLASS_TEACHER_OF_RECORD approver');
      }
      return { approverType: 'CLASS_TEACHER_OF_RECORD', approverValue: instance.classId, assignedUserId: cvClass.classTeacherId };
    }
    if (assignment.roles?.includes('ADMIN')) {
      return { approverType: 'ADMIN', approverValue: 'ADMIN', assignedUserId: null };
    }
    throw new BadRequestException(
      'Unsupported approver assignment -- CV workflows support userIds, roles:["CLASS_TEACHER_OF_RECORD"], or roles:["ADMIN"] only',
    );
  }

  /**
   * `actorIsAdmin` is passed by the controller (from the caller's JWT
   * roles) so an `ADMIN`-pool task can be authorized without a stored
   * assignee id -- see `CvTimetableWorkflowTask.assignedUserId`'s doc
   * comment.
   */
  async completeTask(
    actorId: string,
    taskId: string,
    outcome: 'APPROVED' | 'REJECTED',
    actorIsAdmin: boolean,
    comment?: string,
  ): Promise<CvTimetableWorkflowTask> {
    const task = await this.taskReadRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Workflow task ${taskId} not found`);
    if (task.status !== 'pending') throw new BadRequestException(`Task is '${task.status}', not pending`);

    const authorized = task.assignedUserId === actorId || (task.approverType === 'ADMIN' && actorIsAdmin);
    if (!authorized) throw new ForbiddenException('You are not the assignee of this approval task');

    task.status = 'completed';
    task.outcome = outcome;
    task.comment = comment ?? null;
    task.completedByUserId = actorId;
    task.completedAt = new Date();
    await this.taskWriteRepo.save(task);

    const instance = await this.instanceReadRepo.findOne({ where: { id: task.instanceId } });
    if (!instance) throw new NotFoundException(`Workflow instance ${task.instanceId} not found`);
    const template = await this.templateReadRepo.findOne({ where: { id: instance.workflowTemplateId } });
    if (!template) throw new NotFoundException(`Workflow template ${instance.workflowTemplateId} not found`);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_APPROVAL_TASK_COMPLETED',
      entityType: 'cv_timetable_workflow_tasks',
      entityId: task.id,
      userId: actorId,
      metadata: { instanceId: instance.id, outcome, comment },
    });

    if (outcome === 'REJECTED') {
      await this.finalizeInstance(instance, 'REJECTED', actorId);
      return task;
    }

    const approveTransition = template.definition.transitions.find(
      (t) => t.from === instance.currentState && t.action === 'approve',
    );
    const nextStateId = approveTransition?.to;
    const nextState = nextStateId ? template.definition.states.find((s) => s.id === nextStateId) : undefined;

    if (!nextState || nextState.isTerminal) {
      await this.finalizeInstance(instance, 'APPROVED', actorId);
      return task;
    }

    instance.currentState = nextState.id;
    await this.instanceWriteRepo.save(instance);
    await this.createTaskForCurrentState(instance, template.definition, actorId);

    return task;
  }

  private async finalizeInstance(
    instance: CvTimetableWorkflowInstance,
    outcome: 'APPROVED' | 'REJECTED',
    actorId: string,
  ): Promise<void> {
    instance.status = 'completed';
    instance.outcome = outcome;
    instance.completedAt = new Date();
    await this.instanceWriteRepo.save(instance);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_APPROVAL_COMPLETED',
      entityType: 'cv_timetable_workflow_instances',
      entityId: instance.id,
      userId: actorId,
      metadata: { outcome, sourceType: instance.sourceType, sourceId: instance.sourceId },
    });

    const payload: CvTimetableApprovalCompletedPayload = {
      instanceId: instance.id,
      sourceType: instance.sourceType,
      sourceId: instance.sourceId,
      outcome,
      actorId,
    };
    this.eventEmitter.emit(CV_TIMETABLE_APPROVAL_COMPLETED_EVENT, payload);
  }

  /**
   * Emergency Override -- cancels the instance and every pending task,
   * forcing an APPROVED outcome regardless of how many steps remain.
   * Gated at the controller by `CV:TIMETABLE:EMERGENCY_OVERRIDE`
   * (seeded in Phase 1). `justification` is required and always audited
   * plus emitted as a completion event, matching the design spec's
   * "always-on, no configurable opt-out" treatment of emergency overrides.
   */
  async emergencyOverride(actorId: string, instanceId: string, justification: string): Promise<CvTimetableWorkflowInstance> {
    if (!justification?.trim()) throw new BadRequestException('A justification is required for an emergency override');

    const instance = await this.instanceReadRepo.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException(`Workflow instance ${instanceId} not found`);
    if (instance.status !== 'active') throw new BadRequestException(`Instance is '${instance.status}', not active`);

    await this.taskWriteRepo.update({ instanceId: instance.id, status: 'pending' }, { status: 'cancelled' });

    instance.status = 'cancelled';
    instance.outcome = 'APPROVED';
    instance.completedAt = new Date();
    await this.instanceWriteRepo.save(instance);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_APPROVAL_EMERGENCY_OVERRIDE',
      entityType: 'cv_timetable_workflow_instances',
      entityId: instance.id,
      userId: actorId,
      metadata: { justification, sourceType: instance.sourceType, sourceId: instance.sourceId },
    });

    const payload: CvTimetableApprovalCompletedPayload = {
      instanceId: instance.id,
      sourceType: instance.sourceType,
      sourceId: instance.sourceId,
      outcome: 'APPROVED',
      actorId,
    };
    this.eventEmitter.emit(CV_TIMETABLE_APPROVAL_COMPLETED_EVENT, payload);

    return instance;
  }

  // ── Escalation / reminders ──────────────────────────────────────────

  /**
   * Manually/externally triggerable (no cron infrastructure was
   * introduced by this or any prior phase, consistent with
   * `CvTimetableLifecycleService.activateIfEffective`'s identical
   * approach). Bumps `escalationLevel` on overdue pending tasks and
   * audits it. Does NOT reassign to an escalation target -- no
   * per-step escalation-target configuration exists yet (the design
   * spec's `escalationRule`/`escalationTarget` concept), so this is
   * intentionally partial: it surfaces which tasks are overdue rather
   * than guessing at a reassignment target that isn't configured
   * anywhere. Actual reminder/escalation NOTIFICATIONS are Phase 11's
   * job (integrating the existing NotificationService) -- this method
   * only returns the data a notification step would need.
   */
  async checkOverdueTasks(): Promise<CvTimetableWorkflowTask[]> {
    const overdue = await this.taskReadRepo.find({
      where: { status: 'pending', dueDate: LessThanOrEqual(new Date()) },
    });

    for (const task of overdue) {
      task.escalationLevel += 1;
      await this.taskWriteRepo.save(task);
      await this.auditService.log({
        module: 'CHILDRENS_VILLAGE',
        action: 'CV_TIMETABLE_APPROVAL_TASK_ESCALATED',
        entityType: 'cv_timetable_workflow_tasks',
        entityId: task.id,
        metadata: { instanceId: task.instanceId, escalationLevel: task.escalationLevel },
      });
    }

    return overdue;
  }

  async listPendingTasksForUser(userId: string): Promise<CvTimetableWorkflowTask[]> {
    return this.taskReadRepo.find({ where: { assignedUserId: userId, status: 'pending' } });
  }

  async listPendingAdminTasks(): Promise<CvTimetableWorkflowTask[]> {
    return this.taskReadRepo.find({ where: { approverType: 'ADMIN', status: 'pending' } });
  }
}
