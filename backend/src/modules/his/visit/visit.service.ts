import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRedis } from '../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { HisConfigService } from '../config/his-config.service';
import { buildVisitsByMrnSql } from '../config/query-templates/visit.templates';
import type { HisVisit } from '../his.types';

const VISITS_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class VisitService {
  private readonly logger = new Logger(VisitService.name);

  constructor(
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly hisConfig: HisConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async getVisitsByMrn(
    mrn: string,
    opts: { limit?: number; visitType?: string } = {},
  ): Promise<HisVisit[]> {
    const cacheKey = `his:visits:${mrn}:${opts.visitType ?? 'all'}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as HisVisit[];

    this.assertAvailable();
    const cfg    = await this.hisConfig.getConfig();
    const limit  = opts.limit ?? 50;
    const rawSql = cfg['sql.visit.getByMrn']?.trim();

    // D.5 ("Dynamic Per-Tenant HIS Query Architecture"): the config-built
    // branch's SQL now ALWAYS references `:visitType` (bind-driven filter,
    // never a compile-time-absent clause -- see `buildVisitsByMrnSql`'s D.5
    // doc comment), so that branch always binds it, real value or `null`.
    // The raw-override branch is arbitrary tenant-authored SQL that may or
    // may not reference `:visitType` at all -- same "only bind a
    // placeholder that's actually present" caution `ReferenceService.getDoctors()`
    // already applies to its own raw override's `:deptCode`, followed here
    // for the same reason (an unreferenced named bind can raise an
    // Oracle-driver error depending on the raw SQL's exact shape). Both
    // branches pass the same queryId either way.
    let rows: Record<string, unknown>[];
    if (rawSql) {
      const binds: Record<string, unknown> = { mrn, lim: limit };
      if (opts.visitType && rawSql.includes(':visitType')) binds['visitType'] = opts.visitType;
      rows = await this.oracle.query<Record<string, unknown>>(rawSql, binds, { maxRows: limit, queryId: 'visit.getByMrn' });
    } else {
      const sql = buildVisitsByMrnSql(cfg);
      const binds: Record<string, unknown> = { mrn, lim: limit, visitType: opts.visitType ?? null };
      rows = await this.oracle.query<Record<string, unknown>>(sql, binds, { maxRows: limit, queryId: 'visit.getByMrn' });
    }

    const visits: HisVisit[] = rows.map((r) => ({
      visitId:        String(r['visitId'] ?? ''),
      mrn:            String(r['mrn'] ?? ''),
      visitDate:      String(r['visitDate'] ?? ''),
      visitType:      String(r['visitType'] ?? 'OPD') as HisVisit['visitType'],
      admissionDate:  r['admissionDate'] ? String(r['admissionDate']) : null,
      dischargeDate:  r['dischargeDate'] ? String(r['dischargeDate']) : null,
      doctorCode:     String(r['doctorCode'] ?? ''),
      doctorName:     String(r['doctorName'] ?? ''),
      departmentCode: String(r['departmentCode'] ?? ''),
      departmentName: String(r['departmentName'] ?? ''),
      ward:           r['ward'] ? String(r['ward']) : null,
      bed:            r['bed'] ? String(r['bed']) : null,
      diagnosis:      r['diagnosis'] ? String(r['diagnosis']) : null,
      status:         String(r['status'] ?? 'COMPLETED') as HisVisit['status'],
    }));

    await this.redis.setex(cacheKey, VISITS_CACHE_TTL, JSON.stringify(visits));
    return visits;
  }

  private assertAvailable(): void {
    if (!this.oracle.isAvailable) {
      throw new ServiceUnavailableException('HIS integration is currently unavailable');
    }
  }
}
