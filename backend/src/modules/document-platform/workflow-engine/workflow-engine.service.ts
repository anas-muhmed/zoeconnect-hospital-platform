import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleEngine } from '@hdsp/form-schema';
import { WorkflowTemplateEntity } from './entities/workflow-template.entity';
import { WorkflowTaskEntity } from './entities/workflow-task.entity';
import { WorkflowInstanceEntity } from './entities/workflow-instance.entity';
import { DocumentInstanceService } from '../document-engine/services/document-instance.service';
import { DocumentVersionEntity } from '../document-engine/entities/document-version.entity';
import { ExecutionContextBuilder } from '../forms-runtime/execution-context/execution-context.builder';

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    @InjectRepository(WorkflowTemplateEntity)
    private readonly templateRepo: Repository<WorkflowTemplateEntity>,
    @InjectRepository(WorkflowTaskEntity)
    private readonly taskRepo: Repository<WorkflowTaskEntity>,
    @InjectRepository(WorkflowInstanceEntity)
    private readonly workflowInstanceRepo: Repository<WorkflowInstanceEntity>,
    @InjectRepository(DocumentVersionEntity)
    private readonly docVersionRepo: Repository<DocumentVersionEntity>,
    private readonly instanceService: DocumentInstanceService,
    private readonly executionContextBuilder: ExecutionContextBuilder
  ) {}

  async executeAction(
    instanceId: string, 
    actionName: string, 
    userContext: { userId: string; roles: string[]; department?: string; team?: string }
  ) {
    const instance = await this.instanceService.getInstance(instanceId);
    if (!instance || !instance.documentVersionId) {
      throw new BadRequestException('Instance not found');
    }

    const version = await this.docVersionRepo.findOne({
      where: { id: instance.documentVersionId }
    });

    if (!version) {
      throw new BadRequestException('Document version not found');
    }

    const template = await this.templateRepo.findOne({
      where: { documentTypeId: version.documentId, status: 'published' },
      order: { versionNo: 'DESC' },
    });

    if (!template) {
      throw new BadRequestException('No active workflow found for this document type');
    }

    const currentState = instance.status;

    // Find valid transitions for the current state and requested action
    const transitions = template.definition.transitions.filter(
      t => t.from === currentState && t.action === actionName
    );

    if (transitions.length === 0) {
      throw new BadRequestException(`Action '${actionName}' is not valid from state '${currentState}'`);
    }

    // Evaluate conditions to find the winning transition
    const executionContext = await this.executionContextBuilder.buildContext(instance);
    let targetTransition = null;

    for (const transition of transitions) {
      if (!transition.condition) {
        targetTransition = transition;
        break; // First transition without condition wins
      }

      const isMatch = RuleEngine.evaluate(transition.condition, executionContext.variables);
      if (isMatch) {
        targetTransition = transition;
        break;
      }
    }

    if (!targetTransition) {
      throw new BadRequestException(`Conditions not met for action '${actionName}'`);
    }

    // Process Task completion if there is an active task
    const activeTasks = await this.taskRepo.find({
      where: { instanceId, status: 'pending' }
    });

    for (const task of activeTasks) {
      // Very basic authorization: either the user is assigned directly, or they have the role
      const canComplete = 
        task.assignedUserId === userContext.userId ||
        (task.assignedRole && userContext.roles.includes(task.assignedRole)) ||
        (task.assignedDepartment && userContext.department === task.assignedDepartment) ||
        (task.assignedTeam && userContext.team === task.assignedTeam) ||
        task.claimedByUserId === userContext.userId;

      if (!canComplete) {
        throw new ForbiddenException(`User does not have permission to execute this task`);
      }

      task.status = 'completed';
      task.completedByUserId = userContext.userId;
      task.completedAt = new Date();
      await this.taskRepo.save(task);
    }

    // Handle WorkflowInstanceEntity update
    let workflowInstance = await this.workflowInstanceRepo.findOne({
      where: { documentInstanceId: instanceId }
    });

    if (!workflowInstance) {
      workflowInstance = this.workflowInstanceRepo.create({
        workflowTemplateId: template.id,
        documentInstanceId: instanceId,
        currentState: targetTransition.to,
        currentRevision: 1,
        startedAt: new Date(),
        status: 'active'
      });
    } else {
      workflowInstance.currentState = targetTransition.to;
      workflowInstance.currentRevision += 1;
      
      const targetStateConfig = template.definition.states.find(s => s.id === targetTransition.to);
      if (targetStateConfig?.isTerminal) {
        workflowInstance.status = 'completed';
        workflowInstance.completedAt = new Date();
      }
    }
    await this.workflowInstanceRepo.save(workflowInstance);

    // Transition the document instance (Skip validation because workflow engine guarantees it)
    await this.instanceService.transitionStatus(
      instance, 
      targetTransition.to, 
      userContext.userId, 
      actionName, 
      true
    );

    this.logger.log(`Instance ${instanceId} transitioned from ${currentState} to ${targetTransition.to} via action ${actionName}`);
    
    return instance;
  }
}
