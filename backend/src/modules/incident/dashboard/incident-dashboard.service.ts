import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from '../entities/incident.entity';
import { IncidentCapa } from '../entities/incident-capa.entity';
import { IncidentClosure } from '../entities/incident-closure.entity';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

/**
 * IncidentDashboardService — aggregated dashboard queries.
 *
 * Three dashboard views (per user directive #9):
 *   1. Executive: KPI summary, risk distribution, sentinel events
 *   2. Quality: CAPA effectiveness, investigator workload, SLA compliance
 *   3. Department: Incidents by department heatmap, near-miss ratio
 *
 * All queries use raw SQL / QueryBuilder for performance.
 * Tenant scoping is applied via the standard tenantId WHERE clause.
 */
@Injectable()
export class IncidentDashboardService {
  private readonly logger = new Logger(IncidentDashboardService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
    @InjectRepository(IncidentCapa)
    private readonly capaRepo: Repository<IncidentCapa>,
    @InjectRepository(IncidentClosure)
    private readonly closureRepo: Repository<IncidentClosure>,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /**
   * Resolve and enforce the current tenant context.
   * Throws rather than silently querying across all tenants.
   */
  private async requireTenantId(): Promise<string> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) {
      throw new InternalServerErrorException(
        'Dashboard queries require an active tenant context. ' +
        'Ensure TenantContextInterceptor is applied to the route.',
      );
    }
    return tenantId;
  }

  async getExecutiveSummary(fromDate?: Date, toDate?: Date) {
    const tenantId = await this.requireTenantId();
    const qb = this.incidentRepo.createQueryBuilder('i');
    this.applyTenant(qb, tenantId);
    this.applyDateRange(qb, fromDate, toDate);

    const [totalByStatus, riskDistribution, sentinelCount, nearMissCount, slaBreachCount, severityDistributionRaw] = await Promise.all([
      qb.clone().select('i.status as status, COUNT(*) as count').groupBy('i.status').getRawMany(),
      qb.clone().select('i.risk_level as risk_level, COUNT(*) as count').groupBy('i.risk_level').getRawMany(),
      qb.clone().where('i.is_sentinel_event = true').getCount(),
      qb.clone().where('i.is_near_miss = true').getCount(),
      qb.clone().where('i.sla_closure_breached = true').getCount(),
      qb.clone().select('i.severity_code as severity, COUNT(*) as count').groupBy('i.severity_code').getRawMany(),
    ]);

    const totalIncidents = totalByStatus.reduce((acc, curr) => acc + parseInt(curr.count, 10), 0);
    const openIncidents = totalByStatus
      .filter(s => s.status !== 'CLOSED' && s.status !== 'ARCHIVED')
      .reduce((acc, curr) => acc + parseInt(curr.count, 10), 0);

    const severityDistribution = severityDistributionRaw.map(s => ({
      severity: s.severity,
      count: parseInt(s.count, 10)
    }));

    const criticalIncidents = severityDistribution
      .filter(s => s.severity === 'CRITICAL' || s.severity === 'SENTINEL')
      .reduce((acc, curr) => acc + curr.count, 0);

    return { 
      totalIncidents, 
      openIncidents, 
      criticalIncidents, 
      severityDistribution,
      totalByStatus, 
      riskDistribution, 
      sentinelCount, 
      nearMissCount, 
      slaBreachCount 
    };
  }

  async getDepartmentHeatmap(fromDate?: Date, toDate?: Date) {
    const tenantId = await this.requireTenantId();
    const qb = this.incidentRepo.createQueryBuilder('i')
      .select(['i.department as department', 'i.severity_code as severity_code', 'COUNT(*) as count'])
      .groupBy('i.department, i.severity_code')
      .orderBy('count', 'DESC');
    this.applyTenant(qb, tenantId);
    this.applyDateRange(qb, fromDate, toDate);
    return qb.getRawMany();
  }

  async getInvestigatorWorkload() {
    const tenantId = await this.requireTenantId();
    return this.incidentRepo.createQueryBuilder('i')
      .select([
        'i.lead_investigator_id as investigator_id',
        'COUNT(*) as total',
        `SUM(CASE WHEN i.status NOT IN ('CLOSED', 'ARCHIVED') THEN 1 ELSE 0 END) as active`,
      ])
      .where('i.lead_investigator_id IS NOT NULL')
      .andWhere(tenantId ? 'i.tenant_id = :tenantId' : '1=1', { tenantId: tenantId ?? undefined })
      .groupBy('i.lead_investigator_id')
      .orderBy('active', 'DESC')
      .getRawMany();
  }

  async getSlaCompliance() {
    const tenantId = await this.requireTenantId();
    const qb = this.incidentRepo.createQueryBuilder('i');
    this.applyTenant(qb, tenantId);

    const [total, responseBreached, investigationBreached, capaBreached, closureBreached] = await Promise.all([
      qb.clone().getCount(),
      qb.clone().andWhere('i.sla_response_breached = true').getCount(),
      qb.clone().andWhere('i.sla_investigation_breached = true').getCount(),
      qb.clone().andWhere('i.sla_capa_breached = true').getCount(),
      qb.clone().andWhere('i.sla_closure_breached = true').getCount(),
    ]);

    return { 
      total, 
      responseBreached, 
      responseMet: total - responseBreached,
      investigationBreached, 
      investigationMet: total - investigationBreached,
      capaBreached, 
      capaMet: total - capaBreached,
      closureBreached,
      closureMet: total - closureBreached,
    };
  }

  async getCapaEffectiveness() {
    const tenantId = await this.requireTenantId();
    const raw = await this.capaRepo.createQueryBuilder('c')
      .select([
        'c.status as status',
        'COUNT(*) as count',
        `SUM(CASE WHEN c.is_overdue THEN 1 ELSE 0 END) as overdue`,
      ])
      .where(tenantId ? 'c.tenant_id = :tenantId' : '1=1', { tenantId: tenantId ?? undefined })
      .groupBy('c.status')
      .getRawMany();

    const overdueCount = raw.reduce((acc, curr) => acc + parseInt(curr.overdue || '0', 10), 0);

    return {
      statusDistribution: raw.map(r => ({ status: r.status, count: parseInt(r.count, 10) })),
      overdueCount
    };
  }

  async getNearMissRatio(fromDate?: Date, toDate?: Date) {
    const tenantId = await this.requireTenantId();
    const qb = this.incidentRepo.createQueryBuilder('i');
    this.applyTenant(qb, tenantId);
    this.applyDateRange(qb, fromDate, toDate);

    const [total, nearMiss] = await Promise.all([
      qb.clone().getCount(),
      qb.clone().andWhere('i.is_near_miss = true').getCount(),
    ]);

    return { total, nearMiss, actualIncidents: total - nearMiss, ratio: total > 0 ? nearMiss / total : 0 };
  }

  async getLessonsLearned(limit = 10) {
    const tenantId = await this.requireTenantId();
    return this.closureRepo.createQueryBuilder('cl')
      .select(['cl.incident_id', 'cl.lessons_learned', 'cl.closed_at'])
      .where('cl.lessons_learned IS NOT NULL')
      .andWhere(tenantId ? 'cl.tenant_id = :tenantId' : '1=1', { tenantId: tenantId ?? undefined })
      .orderBy('cl.closed_at', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  private applyTenant(qb: any, tenantId: string): void {
    qb.andWhere('i.tenant_id = :tenantId', { tenantId });
  }

  private applyDateRange(qb: any, from?: Date, to?: Date): void {
    if (from) qb.andWhere('i.created_at >= :from', { from });
    if (to)   qb.andWhere('i.created_at <= :to', { to });
  }
}
