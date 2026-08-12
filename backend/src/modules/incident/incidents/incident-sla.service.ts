import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { Incident } from '../entities/incident.entity';
import { IncidentCapa } from '../entities/incident-capa.entity';
import { IncidentSeverityLevel } from '../entities/incident-severity-level.entity';
import {
  IncidentSlaBreachedEvent,
  IncidentSlaWarningEvent,
} from '../domain/events/incident-events';

/**
 * IncidentSlaService — computes and tracks SLA deadlines.
 *
 * Four SLA tracks (per user directive #4):
 *   1. Response SLA        — from incident created to first acknowledgement
 *   2. Investigation SLA   — from assigned to investigation completed
 *   3. CAPA SLA            — from RCA completed to all CAPA completed
 *   4. Closure SLA         — from incident created to closure
 *
 * SLA values are read from IncidentSeverityLevel.sla* columns.
 *
 * Daily @Cron marks incidents/CAPAs as breached for dashboard display.
 * The sla_*_breached columns on Incident are pre-computed flags so
 * dashboards don't recalculate on every request.
 *
 * Notifications are decoupled: the cron emits domain events that the
 * IncidentNotificationRuleService listens to via @OnEvent() handlers.
 */
@Injectable()
export class IncidentSlaService {
  private readonly logger = new Logger(IncidentSlaService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
    @InjectRepository(IncidentCapa)
    private readonly capaRepo: Repository<IncidentCapa>,
    @InjectRepository(IncidentSeverityLevel)
    private readonly severityRepo: Repository<IncidentSeverityLevel>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Calculate SLA due timestamps from severity configuration.
   * Called at incident creation and on severity change.
   */
  async computeSlaDeadlines(
    severityCode: string,
    tenantId: string | null,
    baseDate: Date = new Date(),
  ): Promise<{
    slaResponseDue: Date | null;
    slaInvestigationDue: Date | null;
    slaCapaDue: Date | null;
    slaClosureDue: Date | null;
  }> {
    const severity = await this.severityRepo.findOne({
      where: { code: severityCode, tenantId, isActive: true } as any,
    }) ?? await this.severityRepo.findOne({
      where: { code: severityCode, isActive: true },
    });

    if (!severity) {
      return { slaResponseDue: null, slaInvestigationDue: null, slaCapaDue: null, slaClosureDue: null };
    }

    const addHours = (base: Date, hours: number) => new Date(base.getTime() + hours * 3600_000);
    const addDays  = (base: Date, days: number)  => new Date(base.getTime() + days * 86400_000);

    return {
      slaResponseDue:      severity.slaResponseHours      ? addHours(baseDate, severity.slaResponseHours)      : null,
      slaInvestigationDue: severity.slaInvestigationHours ? addHours(baseDate, severity.slaInvestigationHours) : null,
      slaCapaDue:          severity.slaCapaDays            ? addDays(baseDate, severity.slaCapaDays)            : null,
      slaClosureDue:       severity.slaClosureDays         ? addDays(baseDate, severity.slaClosureDays)         : null,
    };
  }

  /**
   * Daily cron: marks overdue CAPAs and SLA-breached incidents.
   * Runs once per day at 01:00. After updating flags, emits domain
   * events so that the notification system reacts independently.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async markOverdueCapa(): Promise<void> {
    const now = new Date();

    // ── Mark CAPAs overdue ───────────────────────────────────────────────────
    await this.capaRepo
      .createQueryBuilder()
      .update(IncidentCapa)
      .set({ isOverdue: true })
      .where('due_date < :today', { today: now.toISOString().slice(0, 10) })
      .andWhere('status NOT IN (:...closed)', { closed: ['COMPLETED', 'REJECTED'] })
      .andWhere('is_overdue = false')
      .execute();

    // ── Mark SLA-breached incidents and emit domain events ───────────────────
    const slaStages: Array<{
      dueColumn: string;
      breachedColumn: string;
      stage: 'RESPONSE' | 'CAPA' | 'CLOSURE';
      excludeStatuses: string[];
    }> = [
      { dueColumn: 'sla_response_due',     breachedColumn: 'sla_response_breached',     stage: 'RESPONSE', excludeStatuses: ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'CLOSED', 'ARCHIVED'] },
      { dueColumn: 'sla_capa_due',         breachedColumn: 'sla_capa_breached',         stage: 'CAPA',     excludeStatuses: ['CLOSED', 'ARCHIVED'] },
      { dueColumn: 'sla_closure_due',      breachedColumn: 'sla_closure_breached',      stage: 'CLOSURE',  excludeStatuses: ['CLOSED', 'ARCHIVED'] },
    ];

    for (const { dueColumn, breachedColumn, stage, excludeStatuses } of slaStages) {
      await this.markSlaBreachesAndEmit(dueColumn, breachedColumn, stage, excludeStatuses, now);
    }

    // ── Emit warnings for incidents approaching SLA (90 min window) ──────────
    await this.emitSlaWarnings(now);
  }

  private async markSlaBreachesAndEmit(
    dueColumn: string,
    breachedColumn: string,
    stage: 'RESPONSE' | 'CAPA' | 'CLOSURE',
    excludeStatuses: string[],
    now: Date,
  ): Promise<void> {
    // Fetch newly-breached incidents BEFORE marking them (so we have their IDs and version)
    const newlyBreached = await this.incidentRepo
      .createQueryBuilder('i')
      .select(['i.id', 'i.tenant_id', 'i.version', `i.${dueColumn}`])
      .where(`i.${dueColumn} IS NOT NULL`)
      .andWhere(`i.${dueColumn} < :now`, { now })
      .andWhere(`i.${breachedColumn} = false`)
      .andWhere(`i.status NOT IN (:...excluded)`, { excluded: excludeStatuses })
      .getMany();

    if (newlyBreached.length === 0) return;

    // Bulk update flags
    await this.incidentRepo
      .createQueryBuilder()
      .update(Incident)
      .set({ [breachedColumn]: true } as any)
      .whereInIds(newlyBreached.map(i => i.id))
      .execute();

    this.logger.log(`[SLA] Marked ${newlyBreached.length} incidents as ${breachedColumn}`);

    // Emit one domain event per breached incident
    const correlationId = crypto.randomUUID();
    for (const incident of newlyBreached) {
      const dueDate = (incident as any)[dueColumn] as Date;
      const overdueHours = dueDate
        ? Math.round((now.getTime() - dueDate.getTime()) / 3_600_000)
        : 0;

      const event = new IncidentSlaBreachedEvent(
        crypto.randomUUID(),
        correlationId,
        (incident as any).tenantId ?? null,
        now,
        null, // system actor
        incident.id,
        (incident as any).version ?? 0,
        stage,
        overdueHours,
      );
      this.eventEmitter.emit('incident.sla.breached', event);
    }
  }

  private async emitSlaWarnings(now: Date): Promise<void> {
    const warningWindowMs = 90 * 60 * 1_000; // 90 minutes
    const warningCutoff   = new Date(now.getTime() + warningWindowMs);

    const warningStages: Array<{
      dueColumn: string;
      breachedColumn: string;
      stage: 'RESPONSE' | 'CAPA' | 'CLOSURE';
    }> = [
      { dueColumn: 'sla_response_due',  breachedColumn: 'sla_response_breached',  stage: 'RESPONSE' },
      { dueColumn: 'sla_capa_due',      breachedColumn: 'sla_capa_breached',      stage: 'CAPA' },
      { dueColumn: 'sla_closure_due',   breachedColumn: 'sla_closure_breached',   stage: 'CLOSURE' },
    ];

    const correlationId = crypto.randomUUID();

    for (const { dueColumn, breachedColumn, stage } of warningStages) {
      const approaching = await this.incidentRepo
        .createQueryBuilder('i')
        .select(['i.id', 'i.tenant_id', 'i.version', `i.${dueColumn}`])
        .where(`i.${dueColumn} IS NOT NULL`)
        .andWhere(`i.${dueColumn} >= :now`, { now })
        .andWhere(`i.${dueColumn} <= :cutoff`, { cutoff: warningCutoff })
        .andWhere(`i.${breachedColumn} = false`)
        .getMany();

      for (const incident of approaching) {
        const dueDate = (incident as any)[dueColumn] as Date;
        const hoursRemaining = dueDate
          ? Math.round((dueDate.getTime() - now.getTime()) / 3_600_000)
          : 0;

        const event = new IncidentSlaWarningEvent(
          crypto.randomUUID(),
          correlationId,
          (incident as any).tenantId ?? null,
          now,
          null,
          incident.id,
          (incident as any).version ?? 0,
          stage,
          hoursRemaining,
        );
        this.eventEmitter.emit('incident.sla.warning', event);
      }
    }
  }
}

