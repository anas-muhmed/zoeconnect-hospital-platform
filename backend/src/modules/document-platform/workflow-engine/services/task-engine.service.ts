import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleEngine } from '@hdsp/form-schema';
import { DocumentStateChangedEvent } from '../../document-events/document.events';
import { WorkflowTemplateEntity } from '../entities/workflow-template.entity';
import { WorkflowTaskEntity } from '../entities/workflow-task.entity';
import { DocumentInstanceService } from '../../document-engine/services/document-instance.service';
import { DocumentVersionEntity } from '../../document-engine/entities/document-version.entity';
import { ExecutionContextBuilder } from '../../forms-runtime/execution-context/execution-context.builder';

@Injectable()
export class TaskEngineService {
  private readonly logger = new Logger(TaskEngineService.name);

  constructor(
    @InjectRepository(WorkflowTemplateEntity)
    private readonly templateRepo: Repository<WorkflowTemplateEntity>,
    @InjectRepository(WorkflowTaskEntity)
    private readonly taskRepo: Repository<WorkflowTaskEntity>,
    @InjectRepository(DocumentVersionEntity)
    private readonly docVersionRepo: Repository<DocumentVersionEntity>,
    private readonly instanceService: DocumentInstanceService,
    private readonly executionContextBuilder: ExecutionContextBuilder
  ) {}

  @OnEvent('document.state_changed')
  async handleStateChanged(event: DocumentStateChangedEvent) {
    if (!event.action) {
      this.logger.debug(`No action provided for state change to ${event.newState} on instance ${event.instanceId}. Skipping task generation.`);
      return;
    }

    const instance = await this.instanceService.getInstance(event.instanceId);
    if (!instance || !instance.documentVersionId) return;

    const version = await this.docVersionRepo.findOne({
      where: { id: instance.documentVersionId }
    });

    if (!version) return;

    // TODO: In the future, we might link instances directly to workflow template IDs.
    // For now, assume there is a single active workflow for the document type/version.
    const template = await this.templateRepo.findOne({
      where: { documentTypeId: version.documentId, status: 'published' },
      order: { versionNo: 'DESC' },
    });

    if (!template) {
      this.logger.debug(`No active workflow template for document type ${version.documentId}`);
      return;
    }

    const transition = template.definition.transitions.find(
      t => t.from === event.oldState && t.to === event.newState && t.action === event.action
    );

    if (!transition || !transition.assignTo) {
      return; // No assignment rules for this transition
    }

    // Cancel existing pending tasks for this instance
    await this.taskRepo.update(
      { instanceId: event.instanceId, status: 'pending' },
      { status: 'cancelled' }
    );

    const assignments = Array.isArray(transition.assignTo) ? transition.assignTo : [transition.assignTo];
    const context = await this.executionContextBuilder.buildContext(instance);

    for (const assignTo of assignments) {
      // Evaluate assignment expression if provided
      let dynamicUserId: string | null = null;
      let dynamicRole: string | null = null;
      let dynamicDepartment: string | null = null;
      let dynamicTeam: string | null = null;

      if (assignTo.expression) {
        const result = RuleEngine.evaluate(assignTo.expression, context.variables);
        
        // If expression returns a string, we could assume it's a UserId. 
        // This is extensible based on business rules.
        if (typeof result === 'string') {
          dynamicUserId = result;
        } else if (typeof result === 'object' && result !== null) {
          dynamicUserId = result.userId || null;
          dynamicRole = result.role || null;
          dynamicDepartment = result.department || null;
          dynamicTeam = result.team || null;
        }
      }

      const newTask = this.taskRepo.create({
        instanceId: event.instanceId,
        workflowState: event.newState,
        action: transition.label || 'Action Required',
        status: 'pending',
        assignedUserId: dynamicUserId || (assignTo.userIds && assignTo.userIds.length > 0 ? assignTo.userIds[0] : null),
        assignedRole: dynamicRole || (assignTo.roles && assignTo.roles.length > 0 ? assignTo.roles[0] : null),
        assignedDepartment: dynamicDepartment || (assignTo.departments && assignTo.departments.length > 0 ? assignTo.departments[0] : null),
        assignedTeam: dynamicTeam || (assignTo.teams && assignTo.teams.length > 0 ? assignTo.teams[0] : null),
        dueDate: null, // Will be populated by SLA calculator if needed
        slaMinutes: null,
      });

      await this.taskRepo.save(newTask);
    }
    
    this.logger.log(`Created workflow tasks for instance ${event.instanceId} in state ${event.newState}`);
  }
}
