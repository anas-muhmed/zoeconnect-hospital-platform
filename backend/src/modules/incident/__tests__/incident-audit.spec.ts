import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IncidentService } from '../incidents/incident.service';
import { Incident } from '../entities/incident.entity';
import { IncidentWorkflowService } from '../incidents/incident-workflow.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { IncidentSlaService } from '../incidents/incident-sla.service';
import { AuditService } from '../../audit/audit.service';
import { IncidentNotificationRuleService } from '../notifications/incident-notification-rule.service';
import { User } from '../../users/entities/user.entity';
import { IncidentRiskMatrixConfig } from '../entities/incident-risk-matrix-config.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { IncidentNumberService } from '../incidents/incident-number.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('IncidentService (Audit Integrity)', () => {
  let service: IncidentService;
  let auditService: any;
  let incidentRepo: any;
  let workflow: any;
  let timeline: any;
  let notifRules: any;

  beforeEach(async () => {
    auditService = { log: jest.fn() };
    timeline = { emit: jest.fn() };
    notifRules = { evaluate: jest.fn() };
    workflow = {
      validateTransition: jest.fn(),
      stageLabel: jest.fn().mockReturnValue('Test Stage'),
      isClosed: jest.fn().mockReturnValue(false),
    };
    incidentRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'inc-1',
        status: 'DRAFT',
        tenantId: 't-1',
        version: 1,
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentService,
        { provide: getRepositoryToken(Incident), useValue: incidentRepo },
        { provide: getTenantScopedRepositoryToken(Incident), useValue: incidentRepo },
        { provide: getRepositoryToken(IncidentRiskMatrixConfig), useValue: {} },
        { provide: IncidentWorkflowService, useValue: workflow },
        { provide: IncidentNumberService, useValue: {} },
        { provide: IncidentTimelineService, useValue: timeline },
        { provide: IncidentSlaService, useValue: { computeSlaDeadlines: jest.fn().mockResolvedValue({}) } },
        { provide: AuditService, useValue: auditService },
        { provide: IncidentNotificationRuleService, useValue: notifRules },
        { provide: TenantContextStorage, useValue: { currentTenantIdOrNull: () => 't-1' } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<IncidentService>(IncidentService);
  });

  it('transition logs an audit entry with correct actor and status fields', async () => {
    const actor = { id: 'u-1', username: 'jdoe', fullName: 'John Doe' } as User;

    await service.transition('inc-1', 'SUBMITTED', actor, { comment: 'Ready' });

    expect(auditService.log).toHaveBeenCalledWith({
      action: 'INCIDENT_STATUS_CHANGED',
      module: 'INCIDENT',
      userId: 'u-1',
      entityType: 'Incident',
      entityId: 'inc-1',
      oldValue: { status: 'DRAFT' },
      newValue: { status: 'SUBMITTED' },
    });
  });

  it('update logs an audit entry for incident properties', async () => {
    const actor = { id: 'u-1', username: 'jdoe' } as User;
    incidentRepo.findOne.mockResolvedValueOnce({
      id: 'inc-1',
      status: 'DRAFT',
      severityCode: 'LOW',
      version: 1,
    });

    await service.update('inc-1', { severityCode: 'HIGH' }, actor);

    expect(auditService.log).toHaveBeenCalledWith({
      action: 'INCIDENT_UPDATED',
      module: 'INCIDENT',
      userId: 'u-1',
      entityType: 'Incident',
      entityId: 'inc-1',
      oldValue: { status: 'DRAFT', severityCode: 'LOW' },
      newValue: { severityCode: 'HIGH' },
    });
  });

  it('remove logs an audit entry for deleted draft', async () => {
    const actor = { id: 'u-1', username: 'jdoe' } as User;
    incidentRepo.findOne.mockResolvedValueOnce({
      id: 'inc-1',
      incidentNumber: 'INC-2026-001',
      status: 'DRAFT',
    });

    await service.remove('inc-1', actor);

    expect(auditService.log).toHaveBeenCalledWith({
      action: 'INCIDENT_DELETED',
      module: 'INCIDENT',
      userId: 'u-1',
      entityType: 'Incident',
      entityId: 'inc-1',
      oldValue: { incidentNumber: 'INC-2026-001' },
    });
  });
});
