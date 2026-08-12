import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from '../entities/incident.entity';
import { IncidentCapa } from '../entities/incident-capa.entity';
import { IncidentInvestigation } from '../entities/incident-investigation.entity';
import { IncidentRca } from '../entities/incident-rca.entity';

/**
 * IncidentAnalyticsService — monthly/quarterly/yearly trend analytics.
 *
 * Analytics per user directive #9:
 *   - Incident trends over time
 *   - Root cause trends (top root causes by period)
 *   - Repeat incidents (same category + department)
 *   - Average investigation time
 *   - Sentinel event trend
 *   - Category/severity breakdown
 *
 * All queries are tenant-scoped and date-range filterable.
 */
@Injectable()
export class IncidentAnalyticsService {
  private readonly logger = new Logger(IncidentAnalyticsService.name);

  constructor(
    @InjectRepository(Incident)              private readonly incidentRepo: Repository<Incident>,
    @InjectRepository(IncidentCapa)          private readonly capaRepo: Repository<IncidentCapa>,
    @InjectRepository(IncidentInvestigation) private readonly invRepo: Repository<IncidentInvestigation>,
    @InjectRepository(IncidentRca)           private readonly rcaRepo: Repository<IncidentRca>,
  ) {}

  async getTrends(tenantId: string | null, granularity: 'MONTHLY' | 'QUARTERLY' | 'YEARLY', fromDate: Date, toDate: Date) {
    const truncFormat = granularity === 'YEARLY' ? 'year' : granularity === 'QUARTERLY' ? 'quarter' : 'month';

    const raw = await this.incidentRepo.createQueryBuilder('i')
      .select([
        `DATE_TRUNC('${truncFormat}', i.created_at) as period`,
        'COUNT(*) as total',
        `SUM(CASE WHEN i.severity_code = 'CRITICAL' OR i.severity_code = 'SENTINEL' THEN 1 ELSE 0 END) as critical`,
        `SUM(CASE WHEN i.is_near_miss = true THEN 1 ELSE 0 END) as nearmiss`,
      ])
      .where(tenantId ? 'i.tenant_id = :tenantId' : '1=1', { tenantId: tenantId ?? undefined })
      .andWhere('i.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .groupBy(`period`)
      .orderBy('period', 'ASC')
      .getRawMany();

    return {
      monthly: raw.map(r => ({
        month: new Date(r.period).toLocaleString('default', { month: 'short', year: 'numeric' }),
        total: parseInt(r.total || '0', 10),
        critical: parseInt(r.critical || '0', 10),
        nearMiss: parseInt(r.nearmiss || '0', 10)
      }))
    };
  }

  async getCategoryBreakdown(tenantId: string | null, fromDate: Date, toDate: Date) {
    return this.incidentRepo.createQueryBuilder('i')
      .leftJoin('incident_categories', 'c', 'c.id = i.category_id')
      .select([
        'c.name as category_name',
        'c.code as category_code',
        'COUNT(*) as count',
        `SUM(CASE WHEN i.severity_code = 'CRITICAL' THEN 1 ELSE 0 END) as critical_count`,
      ])
      .where(tenantId ? 'i.tenant_id = :tenantId' : '1=1', { tenantId: tenantId ?? undefined })
      .andWhere('i.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .groupBy('c.name, c.code')
      .orderBy('count', 'DESC')
      .getRawMany();
  }

  async getRepeatIncidents(tenantId: string | null, fromDate: Date, toDate: Date) {
    return this.incidentRepo.createQueryBuilder('i')
      .select([
        'i.category_id as category_id',
        'i.department as department',
        'COUNT(*) as count',
      ])
      .where(tenantId ? 'i.tenant_id = :tenantId' : '1=1', { tenantId: tenantId ?? undefined })
      .andWhere('i.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .groupBy('i.category_id, i.department')
      .having('COUNT(*) > 1')
      .orderBy('count', 'DESC')
      .limit(20)
      .getRawMany();
  }

  async getAverageInvestigationTime(tenantId: string | null, fromDate: Date, toDate: Date) {
    return this.invRepo.createQueryBuilder('inv')
      .select([
        `AVG(EXTRACT(EPOCH FROM (inv.completed_at - inv.started_at)) / 3600) as avg_hours`,
        `MIN(EXTRACT(EPOCH FROM (inv.completed_at - inv.started_at)) / 3600) as min_hours`,
        `MAX(EXTRACT(EPOCH FROM (inv.completed_at - inv.started_at)) / 3600) as max_hours`,
        'COUNT(*) as total_completed',
      ])
      .where('inv.status = :status', { status: 'COMPLETED' })
      .andWhere('inv.completed_at IS NOT NULL AND inv.started_at IS NOT NULL')
      .andWhere(tenantId ? 'inv.tenant_id = :tenantId' : '1=1', { tenantId: tenantId ?? undefined })
      .andWhere('inv.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .getRawOne();
  }

  async getSentinelEventTrend(tenantId: string | null, fromDate: Date, toDate: Date) {
    return this.incidentRepo.createQueryBuilder('i')
      .select([
        `DATE_TRUNC('month', i.incident_date) as month`,
        'COUNT(*) as sentinel_count',
      ])
      .where('i.is_sentinel_event = true')
      .andWhere(tenantId ? 'i.tenant_id = :tenantId' : '1=1', { tenantId: tenantId ?? undefined })
      .andWhere('i.incident_date BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany();
  }
}
