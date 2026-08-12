import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IncidentService } from '../incidents/incident.service';
import { IncidentWorkflowService } from '../incidents/incident-workflow.service';
import { AuditService } from '../../audit/audit.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { IncidentNotificationRuleService } from '../notifications/incident-notification-rule.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import { Incident } from '../entities/incident.entity';
import { IncidentRiskMatrixConfig } from '../entities/incident-risk-matrix-config.entity';
import { IncidentNumberService } from '../incidents/incident-number.service';
import { IncidentSlaService } from '../incidents/incident-sla.service';

describe('Incident Workflow State Machine & Rollback', () => {
  let incidentService: IncidentService;
  let workflowService: IncidentWorkflowService;
  let repoMock: any;
  let timelineMock: any;
  let auditMock: any;
  let notifMock: any;
  let numberServiceMock: any;
  let slaMock: any;
  let riskMock: any;
  let tenantContextMock: any;

  beforeEach(async () => {
    repoMock = {
      findOneOrFail: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    timelineMock = { emit: jest.fn() };
    auditMock = { log: jest.fn() };
    notifMock = { evaluate: jest.fn() };
    numberServiceMock = { generateNumber: jest.fn() };
    slaMock = { computeSlaDeadlines: jest.fn() };
    riskMock = { findOne: jest.fn() };
    tenantContextMock = {
      currentTenantIdOrNull: jest.fn().mockResolvedValue('tenant-1'),
      scopedRepo: jest.fn().mockReturnValue(repoMock),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentService,
        IncidentWorkflowService,
        { provide: getRepositoryToken(Incident), useValue: repoMock },
        { provide: getTenantScopedRepositoryToken(Incident), useValue: repoMock },
        { provide: IncidentTimelineService, useValue: timelineMock },
        { provide: IncidentNotificationRuleService, useValue: notifMock },
        { provide: AuditService, useValue: auditMock },
        { provide: IncidentNumberService, useValue: numberServiceMock },
        { provide: IncidentSlaService, useValue: slaMock },
        { provide: getRepositoryToken(IncidentRiskMatrixConfig), useValue: riskMock },
        { provide: TenantContextStorage, useValue: tenantContextMock },
      ],
    }).compile();

    incidentService = module.get<IncidentService>(IncidentService);
    workflowService = module.get<IncidentWorkflowService>(IncidentWorkflowService);

    // Mock internal findOne for transition logic
    jest.spyOn(incidentService, 'findOne').mockImplementation(async (id) => ({
      id,
      tenantId: 'tenant-1',
      status: 'DRAFT',
      incidentNumber: 'INC-001',
    } as any));
  });

  describe('Workflow Engine', () => {
    it('allows valid transition: DRAFT -> SUBMITTED', () => {
      expect(() => workflowService.validateTransition('DRAFT', 'SUBMITTED')).not.toThrow();
    });

    it('allows valid transition: INVESTIGATION -> CAPA_PENDING', () => {
      expect(() => workflowService.validateTransition('INVESTIGATION', 'CAPA_PENDING')).not.toThrow();
    });

    it('allows CAPA rejection loop: VERIFICATION -> CAPA_PENDING', () => {
      expect(() => workflowService.validateTransition('VERIFICATION', 'CAPA_PENDING')).not.toThrow();
    });

    it('rejects illegal transition: CLOSED -> SUBMITTED', () => {
      expect(() => workflowService.validateTransition('CLOSED', 'SUBMITTED')).toThrow(BadRequestException);
      expect(() => workflowService.validateTransition('CLOSED', 'SUBMITTED')).toThrow(/Invalid status transition/);
    });

    it('rejects illegal transition: INVESTIGATION -> DRAFT', () => {
      expect(() => workflowService.validateTransition('INVESTIGATION', 'DRAFT')).toThrow(BadRequestException);
    });

    it('rejects illegal transition from terminal state: ARCHIVED -> CLOSED', () => {
      expect(() => workflowService.validateTransition('ARCHIVED', 'CLOSED')).toThrow(BadRequestException);
    });
  });

  describe('Rollback & Integrity on Failed Transitions', () => {
    it('ensures failed transitions leave system unchanged (no DB, Audit, Timeline, Notification)', async () => {
      jest.spyOn(incidentService, 'findOne').mockResolvedValueOnce({ id: '1', status: 'CLOSED' } as any);

      const actor = { id: 'u1', username: 'test' } as any;

      await expect(incidentService.transition('1', 'SUBMITTED', actor)).rejects.toThrow(BadRequestException);

      expect(repoMock.update).not.toHaveBeenCalled();
      expect(timelineMock.emit).not.toHaveBeenCalled();
      expect(auditMock.log).not.toHaveBeenCalled();
      expect(notifMock.evaluate).not.toHaveBeenCalled();
    });
  });

  describe('Successful Transition Execution', () => {
    it('executes full sequence of DB update, timeline, audit, and notification for valid transition', async () => {
      const actor = { id: 'u1', username: 'test' } as any;

      await incidentService.transition('1', 'SUBMITTED', actor);

      // Verify DB Update
      expect(repoMock.update).toHaveBeenCalledWith('1', expect.objectContaining({
        status: 'SUBMITTED',
        currentStage: 'Submitted',
        updatedById: 'u1',
      }));

      // Verify Timeline
      expect(timelineMock.emit).toHaveBeenCalledWith(expect.objectContaining({
        incidentId: '1',
        eventType: 'STATUS_CHANGED',
        actorId: 'u1',
      }));

      // Verify Audit
      expect(auditMock.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'INCIDENT_STATUS_CHANGED',
        entityId: '1',
      }));

      // Verify Notifications
      expect(notifMock.evaluate).toHaveBeenCalledWith('INCIDENT_SUBMITTED', expect.anything(), 'tenant-1', expect.any(Function));
    });
  });
});
