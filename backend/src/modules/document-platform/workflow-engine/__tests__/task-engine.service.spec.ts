import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TaskEngineService } from '../services/task-engine.service';
import { WorkflowTemplateEntity } from '../entities/workflow-template.entity';
import { WorkflowTaskEntity } from '../entities/workflow-task.entity';
import { DocumentInstanceService } from '../../document-engine/services/document-instance.service';
import { DocumentVersionEntity } from '../../document-engine/entities/document-version.entity';
import { ExecutionContextBuilder } from '../../forms-runtime/execution-context/execution-context.builder';
import { DocumentStateChangedEvent } from '../../document-events/document.events';

describe('TaskEngineService', () => {
  let service: TaskEngineService;
  let templateRepo: any;
  let taskRepo: any;
  let docVersionRepo: any;
  let instanceService: any;
  let executionContextBuilder: any;

  beforeEach(async () => {
    templateRepo = { findOne: jest.fn() };
    taskRepo = { update: jest.fn(), create: jest.fn(), save: jest.fn() };
    docVersionRepo = { findOne: jest.fn() };
    instanceService = { getInstance: jest.fn() };
    executionContextBuilder = { buildContext: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskEngineService,
        { provide: getRepositoryToken(WorkflowTemplateEntity), useValue: templateRepo },
        { provide: getRepositoryToken(WorkflowTaskEntity), useValue: taskRepo },
        { provide: getRepositoryToken(DocumentVersionEntity), useValue: docVersionRepo },
        { provide: DocumentInstanceService, useValue: instanceService },
        { provide: ExecutionContextBuilder, useValue: executionContextBuilder },
      ],
    }).compile();

    service = module.get<TaskEngineService>(TaskEngineService);
  });

  it('should generate a task when transition requires one', async () => {
    // Mock event
    const event = new DocumentStateChangedEvent('instance-123', 'draft', 'doctor_review', 'sys', 'submit');

    // Mock data
    instanceService.getInstance.mockResolvedValue({ id: 'instance-123', documentVersionId: 'v-123' });
    docVersionRepo.findOne.mockResolvedValue({ id: 'v-123', documentId: 'docType-1' });
    
    templateRepo.findOne.mockResolvedValue({
      definition: {
        transitions: [
          {
            from: 'draft',
            to: 'doctor_review',
            action: 'submit',
            label: 'Submit for Review',
            assignTo: { roles: ['Doctor'] }
          }
        ]
      }
    });

    taskRepo.create.mockReturnValue({ id: 'new-task' });

    // Execute
    await service.handleStateChanged(event);

    // Assertions
    expect(taskRepo.update).toHaveBeenCalledWith(
      { instanceId: 'instance-123', status: 'pending' },
      { status: 'cancelled' }
    );
    
    expect(taskRepo.create).toHaveBeenCalledWith({
      instanceId: 'instance-123',
      workflowState: 'doctor_review',
      action: 'Submit for Review',
      status: 'pending',
      assignedUserId: null,
      assignedRole: 'Doctor',
      assignedDepartment: null,
      assignedTeam: null,
      dueDate: null,
      slaMinutes: null
    });
    
    expect(taskRepo.save).toHaveBeenCalled();
  });
});
