import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRedis } from '../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { HisConfigService } from '../config/his-config.service';
import { buildDepartmentsSql, buildDoctorsSql } from '../config/query-templates/reference.templates';
import type { HisDoctor, HisDepartment } from '../his.types';

const REF_CACHE_TTL = 3600; // 1 hour

@Injectable()
export class ReferenceService {
  private readonly logger = new Logger(ReferenceService.name);

  constructor(
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly hisConfig: HisConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  // -- Departments -----------------------------------------------------------
  async getDepartments(activeOnly = true): Promise<HisDepartment[]> {
    const cacheKey = `his:ref:departments:${activeOnly ? 'active' : 'all'}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as HisDepartment[];

    this.assertAvailable();
    const cfg    = await this.hisConfig.getConfig();
    const rawSql = cfg['sql.reference.departments']?.trim();

    // D.5 ("Dynamic Per-Tenant HIS Query Architecture"): the config-built
    // branch's SQL now always references `:activeOnly` (bind-driven filter
    // -- see `buildDepartmentsSql`'s D.5 doc comment), bound as 1/0. The
    // raw-override branch never had an activeOnly bind concept (its SQL is
    // whatever the tenant wrote), so it's left as-is -- unchanged, no new
    // bind to introduce there. Both branches pass the same queryId.
    let rows: Record<string, unknown>[];
    if (rawSql) {
      rows = await this.oracle.query<Record<string, unknown>>(rawSql, {}, { queryId: 'reference.departments' });
    } else {
      rows = await this.oracle.query<Record<string, unknown>>(
        buildDepartmentsSql(cfg), { activeOnly: activeOnly ? 1 : 0 }, { queryId: 'reference.departments' },
      );
    }

    const normD = (raw: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(raw)) out[k.toLowerCase()] = raw[k];
      return out;
    };
    const pickD = (r: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) if (r[k] != null) return String(r[k]);
      return '';
    };

    const depts: HisDepartment[] = rows.map((raw) => {
      const r = normD(raw);
      return {
        departmentCode: pickD(r, 'departmentcode', 'department_code', 'dept_code', 'deptcode'),
        departmentName: pickD(r, 'departmentname', 'department_name', 'dept_name', 'deptname'),
        shortCode:      pickD(r, 'shortcode', 'short_code', 'shortname', 'short_name'),
        type:           pickD(r, 'type', 'dept_type', 'depttype') || null,
        isActive:       Number(r['isactiveflag'] ?? r['is_active'] ?? 1) === 1,
      };
    });

    await this.redis.setex(cacheKey, REF_CACHE_TTL, JSON.stringify(depts));
    return depts;
  }

  // -- Doctors ---------------------------------------------------------------
  async getDoctors(deptCode?: string): Promise<HisDoctor[]> {
    const cacheKey = `his:ref:doctors:v2:${deptCode ?? 'all'}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as HisDoctor[];

    this.assertAvailable();
    const cfg    = await this.hisConfig.getConfig();
    const rawSql = cfg['sql.reference.doctors']?.trim();

    let rows: Record<string, unknown>[];
    if (rawSql) {
      let finalSql = rawSql;
      const binds: Record<string, unknown> = {};
      
      if (deptCode) {
        if (finalSql.includes(':deptCode')) binds['deptCode'] = deptCode;
      } else if (finalSql.includes(':deptCode')) {
        // If deptCode is not provided (e.g., getting all doctors) but the user included :deptCode 
        // in their custom SQL, strip out the line containing it to prevent NJS-098 and empty results.
        finalSql = finalSql.split('\n').filter(line => !line.includes(':deptCode')).join('\n');
      }

      this.logger.debug(`[getDoctors] Executing query:\n${finalSql}\nbinds: ${JSON.stringify(binds)}`);
      rows = await this.oracle.query<Record<string, unknown>>(finalSql, binds, { queryId: 'reference.doctors' });
    } else {
      // D.5: the config-built branch's SQL now always references
      // `:deptCode` (bind-driven filter -- see `buildDoctorsSql`'s D.5 doc
      // comment), bound as the real value or `null`. The raw-override
      // branch above keeps its existing conditional-bind/strip-line logic
      // unchanged, since it's the tenant's own arbitrary SQL text.
      const sql = buildDoctorsSql(cfg);
      const binds: Record<string, unknown> = { deptCode: deptCode ?? null };
      rows = await this.oracle.query<Record<string, unknown>>(sql, binds, { queryId: 'reference.doctors' });
    }

    // Oracle returns aliases in UPPERCASE unless double-quoted — normalize first
    const norm = (raw: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(raw)) out[k.toLowerCase()] = raw[k];
      return out;
    };
    const pick = (r: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) if (r[k] != null) return String(r[k]);
      return '';
    };

    // TEMP — log first row keys so we can fix pick() aliases (remove after fix)
    if (rows.length > 0) {
      this.logger.log(`[getDoctors] raw keys: ${Object.keys(rows[0]).join(', ')}`);
      this.logger.log(`[getDoctors] raw values: ${JSON.stringify(rows[0])}`);
    } else {
      this.logger.warn('[getDoctors] Oracle returned 0 rows — check sql.reference.doctors query and WHERE conditions');
    }

    const doctors: HisDoctor[] = rows.map((raw) => {
      const r = norm(raw);
      return {
        doctorCode:     pick(r, 'doctorcode', 'doctor_code', 'doc_code', 'empcode', 'emp_code'),
        doctorName:     pick(r, 'doctorname', 'doctor_name', 'doc_name', 'empname', 'emp_name', 'name'),
        specialization: pick(r, 'specialization', 'specialisation', 'spec', 'specialty'),
        departmentCode: pick(r, 'departmentcode', 'department_code', 'dept_code', 'deptcode'),
        departmentName: pick(r, 'departmentname', 'department_name', 'dept_name', 'deptname'),
        qualification:  pick(r, 'qualification', 'qual', 'qualifications') || null,
        isActive:       Number(r['isactiveflag'] ?? r['is_active'] ?? 1) === 1,
      };
    });

    // Only cache if we actually got meaningful data — prevents caching broken empty-name results
    const hasData = doctors.some((d) => d.doctorName.length > 0);
    if (hasData) {
      await this.redis.setex(cacheKey, REF_CACHE_TTL, JSON.stringify(doctors));
    } else {
      this.logger.warn('[ReferenceService.getDoctors] Skipping cache — all doctorName values are empty. Check column alias mapping.');
    }
    return doctors;
  }

  // -- Cache bust ------------------------------------------------------------
  async invalidateReferenceCache(): Promise<void> {
    const keys = await this.redis.keys('his:ref:*');
    if (keys.length) await this.redis.del(...keys);
    this.logger.log(`Cleared ${keys.length} HIS reference cache entries`);
  }

  async getEmployees(search?: string) {
    this.assertAvailable();

    const cfg    = await this.hisConfig.getConfig();
    const rawSql = cfg['sql.reference.employees']?.trim();

    if (rawSql) {
      // Custom SQL from HIS config — pass search bind if the query uses :search
      const binds: Record<string, unknown> = search ? { search: `%${search.toUpperCase()}%` } : {};
      return this.oracle.query<{ employeeCode: string; employeeName: string }>(
        rawSql,
        binds,
        { maxRows: 0 },
      );
    }

    const whereSearch = search
      ? `AND UPPER(employee_name) LIKE :search`
      : '';
    const binds: Record<string, unknown> = search
      ? { search: `%${search.toUpperCase()}%` }
      : {};

    const sql = `
      SELECT
        empno          AS "employeeCode",
        employee_name  AS "employeeName"
      FROM EMPLOYEE
      WHERE emp_status = 75
      ${whereSearch}
      ORDER BY employee_name
    `;

    // maxRows: 0 = unlimited (oracledb default cap of 500 would truncate large tables)
    return this.oracle.query<{ employeeCode: string; employeeName: string }>(
      sql,
      binds,
      { maxRows: 0 },
    );
  }

  // -- User context (Registration Assistant identity resolution) ------------
  //
  // Looks up exactly one HIS user by username -- never the full HISUSER
  // table -- to resolve the employee code the Registration Assistant then
  // maps to an ZoeConnect user via User.hisEmployeeCode (see
  // UsersService.findByHisEmployeeCode). No caching here deliberately: this
  // is called once per workstation session bootstrap, not on every render,
  // and the answer must always reflect who's actually logged into HIS right
  // now, not a stale Redis snapshot.
  async getUserContext(username: string): Promise<{ username: string; employeeCode: string } | null> {
    this.assertAvailable();

    const cfg    = await this.hisConfig.getConfig();
    const rawSql = cfg['sql.reference.userContext']?.trim();

    const sql = rawSql || `
      SELECT
        u.USERNAME     AS "username",
        e.EMPNO        AS "employeeCode"
      FROM HISUSER u
      LEFT JOIN EMPLOYEE e ON e.EMPLOYEE_ID = u.EMPLOYEE_ID
      WHERE u.USERNAME = :username
        AND u.ISACTIVE = 1
    `;

    const row = await this.oracle.queryOne<{ username: string; employeeCode: string | number }>(
      sql,
      { username },
    );
    if (!row) return null;

    return { username: row.username, employeeCode: String(row.employeeCode) };
  }

  private assertAvailable(): void {
    if (!this.oracle.isAvailable) {
      throw new ServiceUnavailableException('HIS integration is currently unavailable');
    }
  }
}
