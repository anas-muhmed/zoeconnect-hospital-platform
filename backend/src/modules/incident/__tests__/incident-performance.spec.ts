/**
 * incident-performance.spec.ts
 *
 * Tests Part E of Priority 5 — Performance baseline.
 *
 * These are timing assertions, not load tests. The goal is to establish
 * regression baselines so that future refactors don't silently degrade
 * query performance.
 *
 * Thresholds:
 *   - Dashboard aggregation (mocked QB) : < 50ms   (pure JS overhead)
 *   - List 200 incidents                : < 50ms
 *   - Timeline with 100 entries         : < 30ms
 *   - Comment list with 50 comments     : < 30ms
 *
 * Note: These tests mock at the repository boundary. The thresholds cover
 * TypeScript/NestJS service overhead only. Actual DB latency is validated
 * separately in the integration pass against a real Postgres instance.
 */

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IncidentDashboardService } from '../dashboard/incident-dashboard.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { IncidentCommentService } from '../timeline/incident-comment.service';
import { IncidentService } from '../incidents/incident.service';
import { Incident } from '../entities/incident.entity';
import { IncidentCapa } from '../entities/incident-capa.entity';
import { IncidentClosure } from '../entities/incident-closure.entity';
import { IncidentTimelineEvent } from '../entities/incident-timeline-event.entity';
import { IncidentComment } from '../entities/incident-comment.entity';
import { IncidentRiskMatrixConfig } from '../entities/incident-risk-matrix-config.entity';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { IncidentWorkflowService } from '../incidents/incident-workflow.service';
import { IncidentNumberService } from '../incidents/incident-number.service';
import { IncidentSlaService } from '../incidents/incident-sla.service';
import { IncidentNotificationRuleService } from '../notifications/incident-notification-rule.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import { ANTI_VIRUS_PROVIDER } from '../attachments/anti-virus.provider';

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateIncidents(count: number): Incident[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `inc-${String(i).padStart(5, '0')}`,
    incidentNumber: `INC-2026-${String(i + 1).padStart(4, '0')}`,
    tenantId: 'tenant-a',
    title: `Incident ${i}`,
    status: 'DRAFT',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Incident));
}

function generateTimelineEvents(count: number): IncidentTimelineEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `tl-${i}`,
    incidentId: 'inc-1',
    eventType: 'STATUS_CHANGED',
    actorId: 'user-1',
    actorName: 'Test Actor',
    description: `Event ${i}`,
    metadata: {},
    createdAt: new Date(),
  } as unknown as IncidentTimelineEvent));
}

function generateComments(count: number): IncidentComment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `comment-${i}`,
    incidentId: 'inc-1',
    authorId: 'user-1',
    authorName: 'Dr. Test',
    content: `Comment ${i} - some clinical note about the incident progression.`,
    visibility: 'INTERNAL',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as IncidentComment));
}

function makeQb(rows: unknown[] = [], count = 0) {
  const qb: any = {};
  ['select', 'where', 'andWhere', 'groupBy', 'orderBy', 'limit', 'skip', 'take'].forEach(m => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb.clone = jest.fn().mockReturnValue(qb);
  qb.getCount = jest.fn().mockResolvedValue(count);
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  qb.getManyAndCount = jest.fn().mockResolvedValue([rows, count]);
  return qb;
}

async function timedMs(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

// ── Dashboard Performance ─────────────────────────────────────────────────────

describe('Performance Baseline', () => {
  afterEach(() => jest.clearAllMocks());

  describe('Dashboard aggregation (mocked repository)', () => {
    async function buildDashboard() {
      const qb = makeQb([], 100);
      const module = await Test.createTestingModule({
        providers: [
          IncidentDashboardService,
          { provide: getRepositoryToken(Incident),        useValue: { createQueryBuilder: jest.fn().mockReturnValue(qb) } },
          { provide: getRepositoryToken(IncidentCapa),    useValue: { createQueryBuilder: jest.fn().mockReturnValue(qb) } },
          { provide: getRepositoryToken(IncidentClosure), useValue: { createQueryBuilder: jest.fn().mockReturnValue(qb) } },
          { provide: TenantContextStorage,                useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue('tenant-a') } },
        ],
      }).compile();
      return module.get(IncidentDashboardService);
    }

    it('getExecutiveSummary completes in < 50ms', async () => {
      const svc = await buildDashboard();
      const ms = await timedMs(() => svc.getExecutiveSummary());
      expect(ms).toBeLessThan(50);
    });

    it('getSlaCompliance completes in < 50ms', async () => {
      const svc = await buildDashboard();
      const ms = await timedMs(() => svc.getSlaCompliance());
      expect(ms).toBeLessThan(50);
    });

    it('getNearMissRatio completes in < 50ms', async () => {
      const svc = await buildDashboard();
      const ms = await timedMs(() => svc.getNearMissRatio());
      expect(ms).toBeLessThan(50);
    });

    it('getCapaEffectiveness completes in < 50ms', async () => {
      const svc = await buildDashboard();
      const ms = await timedMs(() => svc.getCapaEffectiveness());
      expect(ms).toBeLessThan(50);
    });
  });

  // ── Incident List ─────────────────────────────────────────────────────────

  describe('Incident list with 200 records', () => {
    it('findAll(200 items) completes in < 50ms', async () => {
      const incidents = generateIncidents(200);
      const qb = makeQb(incidents, 200);

      const module = await Test.createTestingModule({
        providers: [
          IncidentService,
          { provide: getRepositoryToken(Incident), useValue: { createQueryBuilder: jest.fn().mockReturnValue(qb), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn(), delete: jest.fn() } },
          { provide: getRepositoryToken(IncidentRiskMatrixConfig), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
          { provide: getTenantScopedRepositoryToken(Incident), useValue: { createQueryBuilder: jest.fn().mockReturnValue(qb) } },
          { provide: IncidentWorkflowService,       useValue: { validateTransition: jest.fn() } },
          { provide: IncidentNumberService,         useValue: { generateNumber: jest.fn() } },
          { provide: IncidentSlaService,            useValue: { computeSlaDeadlines: jest.fn() } },
          { provide: IncidentTimelineService,       useValue: { emit: jest.fn() } },
          { provide: IncidentNotificationRuleService, useValue: {} },
          { provide: AuditService,                  useValue: { log: jest.fn() } },
          { provide: TenantContextStorage,          useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue('tenant-a') } },
          { provide: EventEmitter2,                 useValue: { emit: jest.fn() } },
        ],
      }).compile();

      const svc = module.get(IncidentService);
      const ms = await timedMs(() => svc.findAll({ page: 1, limit: 100 } as any));
      expect(ms).toBeLessThan(50);
    });
  });

  // ── Timeline ─────────────────────────────────────────────────────────────

  describe('Timeline with 100 events', () => {
    it('getForIncident(100 events) completes in < 30ms', async () => {
      const events = generateTimelineEvents(100);
      const module = await Test.createTestingModule({
        providers: [
          IncidentTimelineService,
          { provide: getRepositoryToken(IncidentTimelineEvent), useValue: { find: jest.fn().mockResolvedValue(events), create: jest.fn(), save: jest.fn() } },
          { provide: TenantContextStorage, useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue('tenant-a') } },
        ],
      }).compile();

      const svc = module.get(IncidentTimelineService);
      const ms = await timedMs(() => svc.getForIncident('inc-1'));
      expect(ms).toBeLessThan(30);
    });
  });

  // ── Comments ─────────────────────────────────────────────────────────────

  describe('Comments with 50 entries', () => {
    it('getComments(50 comments) completes in < 30ms', async () => {
      const comments = generateComments(50);
      const module = await Test.createTestingModule({
        providers: [
          IncidentCommentService,
          { provide: getRepositoryToken(IncidentComment), useValue: { find: jest.fn().mockResolvedValue(comments), create: jest.fn(), save: jest.fn() } },
          { provide: getTenantScopedRepositoryToken(IncidentComment), useValue: { find: jest.fn().mockResolvedValue(comments) } },
          { provide: IncidentService, useValue: { findOne: jest.fn().mockResolvedValue({ id: 'inc-1', version: 1 }) } },
          { provide: TenantContextStorage, useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue('tenant-a') } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        ],
      }).compile();

      const svc = module.get(IncidentCommentService);
      const ms = await timedMs(() => svc.getComments('inc-1'));
      expect(ms).toBeLessThan(30);
    });
  });
});
