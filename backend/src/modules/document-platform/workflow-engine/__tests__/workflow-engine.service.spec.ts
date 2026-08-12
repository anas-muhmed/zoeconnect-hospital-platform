import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorkflowEngineService } from '../workflow-engine.service';
import { WorkflowTemplateEntity } from '../entities/workflow-template.entity';
import { WorkflowTaskEntity } from '../entities/workflow-task.entity';
import { DocumentInstanceService } from '../../document-engine/services/document-instance.service';
import { DocumentVersionEntity } from '../../document-engine/entities/document-version.entity';
import { WorkflowInstanceEntity } from '../entities/workflow-instance.entity';
import { ExecutionContextBuilder } from '../../forms-runtime/execution-context/execution-context.builder';

describe('WorkflowEngineService', () => {
  let service: WorkflowEngineService;
  let templateRepo: any;
  let taskRepo: any;
  let workflowInstanceRepo: any;
  let docVersionRepo: any;
  let instanceService: any;
  let executionContextBuilder: any;

  beforeEach(async () => {
    templateRepo = {
      findOne: jest.fn(),
    };
    taskRepo = {
      find: jest.fn(),
      save: jest.fn(),
    };
    workflowInstanceRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    docVersionRepo = {
      findOne: jest.fn(),
    };
    instanceService = {
      getInstance: jest.fn(),
      transitionStatus: jest.fn(),
    };
    executionContextBuilder = {
      buildContext: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowEngineService,
        { provide: getRepositoryToken(WorkflowTemplateEntity), useValue: templateRepo },
        { provide: getRepositoryToken(WorkflowTaskEntity), useValue: taskRepo },
        { provide: getRepositoryToken(WorkflowInstanceEntity), useValue: workflowInstanceRepo },
        { provide: getRepositoryToken(DocumentVersionEntity), useValue: docVersionRepo },
        { provide: DocumentInstanceService, useValue: instanceService },
        { provide: ExecutionContextBuilder, useValue: executionContextBuilder },
      ],
    }).compile();

    service = module.get<WorkflowEngineService>(WorkflowEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeAction', () => {
    it('should successfully transition document and complete active tasks', async () => {
      // Mock data
      instanceService.getInstance.mockResolvedValue({
        id: 'instance-123',
        documentVersionId: 'version-123',
        status: 'draft',
      });
      docVersionRepo.findOne.mockResolvedValue({
        id: 'version-123',
        documentId: 'docType-ABC',
      });
      templateRepo.findOne.mockResolvedValue({
        documentTypeId: 'docType-ABC',
        status: 'published',
        definition: {
          transitions: [
            { from: 'draft', action: 'submit', to: 'doctor_review' },
          ],
        },
      });
      executionContextBuilder.buildContext.mockResolvedValue({ variables: {} });
      
      const mockTask = {
        id: 'task-1',
        instanceId: 'instance-123',
        status: 'pending',
        assignedUserId: 'user-1',
      };
      taskRepo.find.mockResolvedValue([mockTask]);

      // Execute
      await service.executeAction('instance-123', 'submit', {
        userId: 'user-1',
        roles: [],
      });

      // Assertions
      expect(mockTask.status).toBe('completed');
      expect(taskRepo.save).toHaveBeenCalledWith(mockTask);
      expect(instanceService.transitionStatus).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'instance-123' }),
        'doctor_review',
        'user-1',
        'submit',
        true
      );
    });

    it('should evaluate conditional rules and route accordingly', async () => {
      // Mock data
      instanceService.getInstance.mockResolvedValue({
        id: 'instance-123',
        documentVersionId: 'version-123',
        status: 'doctor_review',
      });
      docVersionRepo.findOne.mockResolvedValue({
        id: 'version-123',
        documentId: 'docType-ABC',
      });
      
      templateRepo.findOne.mockResolvedValue({
        documentTypeId: 'docType-ABC',
        status: 'published',
        definition: {
          transitions: [
            {
              from: 'doctor_review', action: 'approve', to: 'consultant_review',
              condition: { type: 'rule', op: 'EQ', left: { type: 'rule', op: 'VAR', path: 'riskScore' }, right: { type: 'rule', op: 'CONST', value: 'high' } }
            },
            {
              from: 'doctor_review', action: 'approve', to: 'approved',
            }
          ],
        },
      });
      
      // Execution context with high risk score
      executionContextBuilder.buildContext.mockResolvedValue({ variables: { riskScore: 'high' } });
      taskRepo.find.mockResolvedValue([]);

      // Execute
      await service.executeAction('instance-123', 'approve', { userId: 'user-1', roles: [] });

      // Assertions - It should route to consultant_review because condition matches
      expect(instanceService.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        'consultant_review',
        'user-1',
        'approve',
        true
      );
    });

    it('should throw ForbiddenException if user lacks permission for the task', async () => {
      // Mock data
      instanceService.getInstance.mockResolvedValue({
        id: 'instance-123',
        documentVersionId: 'version-123',
        status: 'draft',
      });
      docVersionRepo.findOne.mockResolvedValue({ id: 'version-123', documentId: 'docType-ABC' });
      templateRepo.findOne.mockResolvedValue({
        documentTypeId: 'docType-ABC',
        status: 'published',
        definition: { transitions: [{ from: 'draft', action: 'submit', to: 'doctor_review' }] },
      });
      executionContextBuilder.buildContext.mockResolvedValue({ variables: {} });
      
      // Task assigned to specific user different from executor
      taskRepo.find.mockResolvedValue([{
        id: 'task-1',
        status: 'pending',
        assignedUserId: 'user-2', // Different user
      }]);

      // Execute & Assert
      await expect(service.executeAction('instance-123', 'submit', {
        userId: 'user-1',
        roles: [],
      })).rejects.toThrow(ForbiddenException);
    });
  });
});
