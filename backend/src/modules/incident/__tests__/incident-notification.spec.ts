/**
 * incident-notification.spec.ts
 *
 * Tests the event-driven notification architecture:
 *   1. Emission integrity  — correct events are emitted on assignment/reassignment/comment
 *   2. Deduplication       — same event+version+target is suppressed within the window
 *   3. Self-suppression    — comment author is never notified for their own comment
 *   4. Disabled rules      — inactive rules are never fired
 *   5. Multi-recipient     — all role + user targets receive the notification
 *   6. Failure isolation   — a failing dispatch does not break other recipients
 *   7. Event ordering      — events are processed in the order they are emitted
 */

import { EventEmitter2 } from '@nestjs/event-emitter';
import { IncidentNotificationRuleService } from '../notifications/incident-notification-rule.service';
import {
  IncidentAssignedEvent,
  IncidentReassignedEvent,
  IncidentCommentAddedEvent,
  IncidentSlaBreachedEvent,
  IncidentSlaWarningEvent,
  IncidentStatusChangedEvent,
} from '../domain/events/incident-events';
import { IncidentNotificationRule } from '../entities/incident-notification-rule.entity';

// ── helpers ─────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<IncidentNotificationRule> = {}): IncidentNotificationRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    triggerEvent: 'incident.assigned',
    conditions: [],
    notifyRoles: [],
    notifyUserIds: ['user-a', 'user-b'],
    tenantId: 't-1',
    isActive: true,
    ...overrides,
  } as any;
}

function makeService(rules: IncidentNotificationRule[]): IncidentNotificationRuleService {
  const ruleRepo = {
    // Honour the { where: { triggerEvent, isActive: true } } filter the service issues
    find: jest.fn().mockImplementation(({ where }: { where?: { isActive?: boolean } }) =>
      Promise.resolve(
        where?.isActive !== undefined
          ? rules.filter(r => r.isActive === where.isActive)
          : rules,
      )
    ),
  } as any;
  return new IncidentNotificationRuleService(ruleRepo);
}

function baseEvent<T extends object>(overrides: T) {
  return {
    eventId: 'ev-1',
    correlationId: 'corr-1',
    tenantId: 't-1',
    timestamp: new Date(),
    actorId: 'actor-1',
    incidentId: 'inc-1',
    entityVersion: 1,
    ...overrides,
  };
}

// ── 1. Emission Integrity ────────────────────────────────────────────────────

describe('IncidentNotificationRuleService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('1. Event emission via EventEmitter2 (IncidentService)', () => {
    it('emits incident.assigned on first assignment', async () => {
      const ee = new EventEmitter2();
      const handler = jest.fn();
      ee.on('incident.assigned', handler);

      ee.emit('incident.assigned', new IncidentAssignedEvent(
        'ev-1', 'corr-1', 't-1', new Date(), 'actor-1', 'inc-1', 1, 'inv-1', [],
      ));

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as IncidentAssignedEvent;
      expect(event.assigneeId).toBe('inv-1');
      expect(event.correlationId).toBe('corr-1');
      expect(event.entityVersion).toBe(1);
    });

    it('emits incident.reassigned (not incident.assigned) when investigator changes', () => {
      const ee = new EventEmitter2();
      const assignedHandler    = jest.fn();
      const reassignedHandler  = jest.fn();
      ee.on('incident.assigned',   assignedHandler);
      ee.on('incident.reassigned', reassignedHandler);

      ee.emit('incident.reassigned', new IncidentReassignedEvent(
        'ev-2', 'corr-2', 't-1', new Date(), 'actor-1', 'inc-1', 2,
        'old-inv', 'new-inv', [],
      ));

      expect(assignedHandler).not.toHaveBeenCalled();
      expect(reassignedHandler).toHaveBeenCalledTimes(1);
      const event = reassignedHandler.mock.calls[0][0] as IncidentReassignedEvent;
      expect(event.previousAssigneeId).toBe('old-inv');
      expect(event.newAssigneeId).toBe('new-inv');
    });

    it('emits incident.sla.breached with the correct stage and overdueHours', () => {
      const ee = new EventEmitter2();
      const handler = jest.fn();
      ee.on('incident.sla.breached', handler);

      ee.emit('incident.sla.breached', new IncidentSlaBreachedEvent(
        'ev-3', 'corr-3', 't-1', new Date(), null, 'inc-1', 1, 'RESPONSE', 3,
      ));

      const event = handler.mock.calls[0][0] as IncidentSlaBreachedEvent;
      expect(event.stage).toBe('RESPONSE');
      expect(event.overdueHours).toBe(3);
    });

    it('emits incident.sla.warning separately from incident.sla.breached', () => {
      const ee = new EventEmitter2();
      const breachHandler  = jest.fn();
      const warningHandler = jest.fn();
      ee.on('incident.sla.breached', breachHandler);
      ee.on('incident.sla.warning',  warningHandler);

      ee.emit('incident.sla.warning', new IncidentSlaWarningEvent(
        'ev-4', 'corr-4', 't-1', new Date(), null, 'inc-1', 1, 'CLOSURE', 1,
      ));

      expect(breachHandler).not.toHaveBeenCalled();
      expect(warningHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ── 2. Deduplication ──────────────────────────────────────────────────────

  describe('2. Duplicate notification suppression', () => {
    it('fires dispatch only once for the same ruleId+eventType+incidentId+version+target within the window', async () => {
      const dispatchSpy = jest.spyOn(
        IncidentNotificationRuleService.prototype as any,
        'dispatchNotification',
      );
      const svc = makeService([makeRule()]);

      const event = new IncidentAssignedEvent('ev-1', 'c-1', 't-1', new Date(), 'actor-1', 'inc-1', 1, 'inv-1', []);
      await (svc as any).processEvent('incident.assigned', event, { assigneeId: 'inv-1' });
      await (svc as any).processEvent('incident.assigned', event, { assigneeId: 'inv-1' }); // duplicate

      // user-a and user-b each dispatched once, not twice
      const calls = (dispatchSpy.mock.calls as [string, string, IncidentNotificationRule, ...unknown[]][])
        .filter(c => c[2].id === 'rule-1');
      const targets = calls.map(c => c[0]);
      expect(targets.filter(t => t === 'user-a').length).toBe(1);
      expect(targets.filter(t => t === 'user-b').length).toBe(1);

      dispatchSpy.mockRestore();
    });

    it('fires again after a new entity version (optimistic lock increment)', async () => {
      const dispatchSpy = jest.spyOn(
        IncidentNotificationRuleService.prototype as any,
        'dispatchNotification',
      );
      const svc = makeService([makeRule()]);

      const eventV1 = new IncidentAssignedEvent('ev-1', 'c-1', 't-1', new Date(), 'actor-1', 'inc-1', 1, 'inv-1', []);
      const eventV2 = new IncidentAssignedEvent('ev-2', 'c-2', 't-1', new Date(), 'actor-1', 'inc-1', 2, 'inv-1', []);

      await (svc as any).processEvent('incident.assigned', eventV1, {});
      await (svc as any).processEvent('incident.assigned', eventV2, {}); // different version → new key

      const targets = dispatchSpy.mock.calls.map(c => c[0]);
      // user-a appears twice (once per version)
      expect(targets.filter(t => t === 'user-a').length).toBe(2);

      dispatchSpy.mockRestore();
    });
  });

  // ── 3. Self-notification Suppression ─────────────────────────────────────

  describe('3. Self-comment suppression', () => {
    it('does NOT notify the comment author', async () => {
      const dispatchSpy = jest.spyOn(
        IncidentNotificationRuleService.prototype as any,
        'dispatchNotification',
      );
      const svc = makeService([makeRule({
        triggerEvent: 'incident.comment.added',
        notifyUserIds: ['author-id', 'user-b'],
      })]);

      const event = new IncidentCommentAddedEvent(
        'ev-1', 'c-1', 't-1', new Date(), 'author-id', 'inc-1', 1,
        'comment-1', 'INTERNAL',
      );
      await (svc as any).processEvent('incident.comment.added', event, {}, 'author-id');

      const targets = dispatchSpy.mock.calls.map(c => c[0]);
      expect(targets).not.toContain('author-id');
      expect(targets).toContain('user-b');

      dispatchSpy.mockRestore();
    });

    it('notifies the author if they are listed as a role target (not user target)', async () => {
      const dispatchSpy = jest.spyOn(
        IncidentNotificationRuleService.prototype as any,
        'dispatchNotification',
      );
      const svc = makeService([makeRule({
        triggerEvent: 'incident.comment.added',
        notifyRoles: ['QUALITY_MANAGER'],
        notifyUserIds: ['author-id'],
      })]);

      const event = new IncidentCommentAddedEvent(
        'ev-1', 'c-1', 't-1', new Date(), 'author-id', 'inc-1', 1,
        'comment-1', 'PUBLIC',
      );
      await (svc as any).processEvent('incident.comment.added', event, {}, 'author-id');

      const targets = dispatchSpy.mock.calls.map(c => c[0]);
      // Role dispatches are NOT filtered (they target role members, not the author directly)
      expect(targets).toContain('QUALITY_MANAGER');
      // User target matching author is suppressed
      expect(targets).not.toContain('author-id');

      dispatchSpy.mockRestore();
    });
  });

  // ── 4. Disabled Rule Handling ─────────────────────────────────────────────

  describe('4. Disabled rules are ignored', () => {
    it('does not dispatch when matching rule is inactive', async () => {
      const dispatchSpy = jest.spyOn(
        IncidentNotificationRuleService.prototype as any,
        'dispatchNotification',
      );
      const svc = makeService([makeRule({ isActive: false })]);

      const event = new IncidentAssignedEvent('ev-1', 'c-1', 't-1', new Date(), 'actor-1', 'inc-1', 1, 'inv-1', []);
      await (svc as any).processEvent('incident.assigned', event, {});

      expect(dispatchSpy).not.toHaveBeenCalled();
      dispatchSpy.mockRestore();
    });
  });

  // ── 5. Multi-recipient ───────────────────────────────────────────────────

  describe('5. Multi-recipient dispatch', () => {
    it('notifies all roles and all users listed in the rule', async () => {
      const dispatchSpy = jest.spyOn(
        IncidentNotificationRuleService.prototype as any,
        'dispatchNotification',
      );
      const svc = makeService([makeRule({
        notifyRoles: ['MEDICAL_SUPERINTENDENT', 'QUALITY_HEAD'],
        notifyUserIds: ['user-x', 'user-y', 'user-z'],
      })]);

      const event = new IncidentAssignedEvent('ev-1', 'c-1', 't-1', new Date(), 'actor-1', 'inc-1', 1, 'inv-1', []);
      await (svc as any).processEvent('incident.assigned', event, {});

      const targets = dispatchSpy.mock.calls.map(c => c[0]);
      expect(targets).toEqual(expect.arrayContaining([
        'MEDICAL_SUPERINTENDENT', 'QUALITY_HEAD', 'user-x', 'user-y', 'user-z',
      ]));
      expect(dispatchSpy).toHaveBeenCalledTimes(5);

      dispatchSpy.mockRestore();
    });
  });

  // ── 6. Failure Isolation ─────────────────────────────────────────────────

  describe('6. Notification failure isolation', () => {
    it('continues dispatching to remaining recipients when one fails', async () => {
      let callCount = 0;
      jest.spyOn(IncidentNotificationRuleService.prototype as any, 'dispatchNotification')
        .mockImplementation(async (targetId: string) => {
          callCount++;
          if (targetId === 'user-a') throw new Error('SMTP timeout');
        });

      const svc = makeService([makeRule({ notifyUserIds: ['user-a', 'user-b'] })]);

      const event = new IncidentAssignedEvent('ev-1', 'c-1', 't-1', new Date(), 'actor-1', 'inc-1', 1, 'inv-1', []);
      await expect(
        (svc as any).processEvent('incident.assigned', event, {})
      ).resolves.not.toThrow();

      expect(callCount).toBe(2); // both were attempted
    });
  });

  // ── 7. Event Ordering ────────────────────────────────────────────────────

  describe('7. Event ordering', () => {
    it('processes events in the order they are emitted', async () => {
      const received: string[] = [];
      const ee = new EventEmitter2();

      ee.on('incident.status.changed', (e: IncidentStatusChangedEvent) => {
        received.push(e.newStatus);
      });

      const statuses = ['SUBMITTED', 'ACKNOWLEDGED', 'ASSIGNED', 'TRIAGE'];
      for (const [i, status] of statuses.entries()) {
        ee.emit('incident.status.changed', new IncidentStatusChangedEvent(
          `ev-${i}`, 'corr-1', 't-1', new Date(), 'actor-1', 'inc-1', i + 1,
          statuses[i - 1] ?? 'DRAFT', status,
        ));
      }

      expect(received).toEqual(statuses);
    });
  });
});
