import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { IncidentNotificationRule } from '../entities/incident-notification-rule.entity';
import {
  IncidentAssignedEvent,
  IncidentReassignedEvent,
  IncidentSlaBreachedEvent,
  IncidentSlaWarningEvent,
  IncidentCommentAddedEvent,
  IncidentStatusChangedEvent,
} from '../domain/events/incident-events';

/**
 * IncidentNotificationRuleService — event-driven notification dispatcher.
 *
 * Design:
 *   - Listens to domain events via explicit @OnEvent handlers.
 *   - Evaluates configurable rules stored in IncidentNotificationRule.
 *   - Applies self-notification suppression (author never notified for own action).
 *   - Applies duplicate suppression: the same {ruleId, eventType, incidentId,
 *     entityVersion, targetId} combination is only dispatched once within
 *     DEDUP_WINDOW_MS. This protects against cron job retries, burst events,
 *     or multiple simultaneous SLA breaches.
 *
 * Condition operators: 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'contains'
 *
 * Notification dispatch is currently a logger stub. Replace the body of
 * dispatchNotification() with the real channel (email, push, SMS, etc.)
 * without touching any of the event or rule evaluation logic.
 */
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class IncidentNotificationRuleService {
  private readonly logger = new Logger(IncidentNotificationRuleService.name);

  private readonly dedupCache = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 5 * 60 * 1_000; // 5 minutes

  constructor(
    @InjectRepository(IncidentNotificationRule)
    private readonly ruleRepo: Repository<IncidentNotificationRule>,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // ── Event Handlers ─────────────────────────────────────────────────────────

  @OnEvent('incident.assigned', { async: true })
  async onAssigned(event: IncidentAssignedEvent): Promise<void> {
    await this.processEvent('incident.assigned', event, { assigneeId: event.assigneeId });
  }

  @OnEvent('incident.reassigned', { async: true })
  async onReassigned(event: IncidentReassignedEvent): Promise<void> {
    await this.processEvent('incident.reassigned', event, {
      previousAssigneeId: event.previousAssigneeId,
      newAssigneeId: event.newAssigneeId,
    });
  }

  @OnEvent('incident.status.changed', { async: true })
  async onStatusChanged(event: IncidentStatusChangedEvent): Promise<void> {
    await this.processEvent(`incident.status.${event.newStatus.toLowerCase()}`, event, {
      oldStatus: event.oldStatus,
      newStatus: event.newStatus,
    });
  }

  @OnEvent('incident.sla.breached', { async: true })
  async onSlaBreached(event: IncidentSlaBreachedEvent): Promise<void> {
    await this.processEvent('incident.sla.breached', event, {
      stage: event.stage,
      overdueHours: event.overdueHours,
    });
  }

  @OnEvent('incident.sla.warning', { async: true })
  async onSlaWarning(event: IncidentSlaWarningEvent): Promise<void> {
    await this.processEvent('incident.sla.warning', event, {
      stage: event.stage,
      hoursRemaining: event.hoursRemaining,
    });
  }

  @OnEvent('incident.comment.added', { async: true })
  async onCommentAdded(event: IncidentCommentAddedEvent): Promise<void> {
    // Self-comment suppression: pass authorId as the actor to suppress
    await this.processEvent('incident.comment.added', event, {
      commentId: event.commentId,
      visibility: event.visibility,
    }, event.actorId);
  }

  // ── Core Processing ────────────────────────────────────────────────────────

  private async processEvent(
    triggerEvent: string,
    event: { incidentId: string; tenantId: string | null; entityVersion: number; correlationId: string },
    extraContext: Record<string, unknown>,
    suppressRecipientId?: string,
  ): Promise<void> {
    const rules = await this.ruleRepo.find({ where: { triggerEvent, isActive: true } });
    const tenantRules = rules.filter(r => r.tenantId === event.tenantId || r.tenantId === null);

    if (tenantRules.length === 0) return;

    const context: Record<string, unknown> = {
      incidentId: event.incidentId,
      tenantId: event.tenantId,
      entityVersion: event.entityVersion,
      correlationId: event.correlationId,
      ...extraContext,
    };

    for (const rule of tenantRules) {
      if (!this.allConditionsMatch(rule.conditions ?? [], context)) continue;

      // Roles are resolved to the concrete users holding them at dispatch
      // time (via `user_roles`), rather than left as opaque role-name
      // strings — otherwise "notify RISK_MANAGER" never actually reaches
      // anyone. De-duplicated against notifyUserIds so someone targeted by
      // both their role and their explicit id isn't double-dispatched.
      const roleUserIds = await this.resolveRoleTargets(rule.notifyRoles);
      const explicitUserIds = new Set(rule.notifyUserIds);
      const allTargets = [
        ...roleUserIds.filter(id => !explicitUserIds.has(id)).map(id => ({ id, type: 'user' as const })),
        ...rule.notifyUserIds.map(u => ({ id: u, type: 'user' as const })),
      ];

      for (const target of allTargets) {
        // Self-notification suppression
        if (suppressRecipientId && target.type === 'user' && target.id === suppressRecipientId) {
          this.logger.debug(`[Notif] Suppressed self-notification for ${target.id} on ${triggerEvent}`);
          continue;
        }

        // Duplicate suppression
        const dedupKey = `${rule.id}:${triggerEvent}:${event.incidentId}:${event.entityVersion}:${target.id}`;
        if (this.isDuplicate(dedupKey)) {
          this.logger.debug(`[Notif] Duplicate suppressed: ${dedupKey}`);
          continue;
        }
        this.markDispatched(dedupKey);

        await this.dispatchNotification(target.id, target.type, rule, context, event.incidentId).catch(err =>
          this.logger.error(`[Notif] Dispatch failed for ${target.id}: ${err.message}`),
        );
      }

      this.logger.log(`[Notif] Rule "${rule.name}" processed for ${triggerEvent} on incident ${event.incidentId} (correlationId=${event.correlationId})`);
    }
  }

  /**
   * Resolves role names (e.g. "RISK_MANAGER") to the user ids currently
   * assigned to that role, via `incident_notification_role_members` — an
   * incident-module-scoped mapping (Incident Settings → Role Assignments),
   * deliberately separate from platform RBAC's `user_roles`/`roles`. These
   * names are escalation/notification labels, not login permission roles,
   * so a hospital can freely define "RISK_MANAGER" here without it needing
   * to exist as (or collide with) a platform role.
   */
  private async resolveRoleTargets(roleNames: string[]): Promise<string[]> {
    if (!roleNames || roleNames.length === 0) return [];
    const rows: { id: string }[] = await this.ruleRepo.manager.query(
      `SELECT DISTINCT m.user_id AS id
       FROM incident_notification_role_members m
       JOIN incident_notification_roles r ON r.id = m.notification_role_id
       WHERE r.name = ANY($1::text[]) AND r.is_active = true`,
      [roleNames],
    );
    return rows.map((r) => r.id);
  }

  private isDuplicate(key: string): boolean {
    const ts = this.dedupCache.get(key);
    if (!ts) return false;
    return Date.now() - ts < this.DEDUP_WINDOW_MS;
  }

  private markDispatched(key: string): void {
    this.dedupCache.set(key, Date.now());

    // Lazy cleanup: remove expired keys periodically to prevent unbounded growth
    if (this.dedupCache.size > 10_000) {
      const cutoff = Date.now() - this.DEDUP_WINDOW_MS;
      for (const [k, ts] of this.dedupCache.entries()) {
        if (ts < cutoff) this.dedupCache.delete(k);
      }
    }
  }

  // ── Stub Dispatcher ────────────────────────────────────────────────────────

  private async dispatchNotification(
    targetId: string,
    targetType: 'role' | 'user',
    rule: IncidentNotificationRule,
    ctx: Record<string, unknown>,
    incidentId: string,
  ): Promise<void> {
    const message = this.buildMessage(rule, ctx);
    // TODO: Replace with real notification channel (EmailService, PushService, etc.)
    this.logger.log(`[Notif] ${targetType.toUpperCase()} ${targetId}: ${message} (incident=${incidentId})`);
  }

  // ── Condition Evaluation ───────────────────────────────────────────────────

  private allConditionsMatch(
    conditions: Array<{ field: string; op: string; value: unknown }>,
    ctx: Record<string, unknown>,
  ): boolean {
    for (const cond of conditions) {
      const fieldValue = ctx[cond.field];
      switch (cond.op) {
        case 'eq':       if (fieldValue !== cond.value) return false; break;
        case 'neq':      if (fieldValue === cond.value) return false; break;
        case 'in':       if (!Array.isArray(cond.value) || !cond.value.includes(fieldValue)) return false; break;
        case 'contains': if (typeof fieldValue !== 'string' || !fieldValue.includes(cond.value as string)) return false; break;
        case 'gt':       if ((fieldValue as number) <= (cond.value as number)) return false; break;
        case 'lt':       if ((fieldValue as number) >= (cond.value as number)) return false; break;
        default:         this.logger.warn(`[Notif] Unknown condition op: ${cond.op}`);
      }
    }
    return true;
  }

  private buildMessage(rule: IncidentNotificationRule, ctx: Record<string, unknown>): string {
    const incidentId   = ctx['incidentId'] ?? 'N/A';
    const severity     = ctx['severityCode'] ?? ctx['severity_code'] ?? '';
    const department   = ctx['department'] ?? '';
    return `[INCIDENT ${incidentId}] ${rule.name} — ${severity} severity in ${department}`;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async findAll(): Promise<IncidentNotificationRule[]> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    return this.ruleRepo.find({ 
      where: { isActive: true, tenantId: tenantId ?? undefined }, 
      order: { triggerEvent: 'ASC' } 
    });
  }

  async create(dto: any): Promise<IncidentNotificationRule> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const rule = this.ruleRepo.create({ ...dto, tenantId });
    return this.ruleRepo.save(rule) as any;
  }

  async update(id: string, dto: any): Promise<IncidentNotificationRule> {
    await this.ruleRepo.update(id, dto);
    return this.ruleRepo.findOneBy({ id }) as Promise<IncidentNotificationRule>;
  }
}
