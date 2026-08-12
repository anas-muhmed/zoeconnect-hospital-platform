import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRedis } from '../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { HisConfigService } from '../config/his-config.service';
import { buildPatientSelect, buildPatientSearchSql } from '../config/query-templates/patient.templates';
import type { HisPatient, HisSearchResult } from '../his.types';
import { CACHE_KEYS } from '../../../config/redis.config';

const PATIENT_CACHE_TTL = 300;  // 5 minutes
const SEARCH_CACHE_TTL  = 60;   // 1 minute

@Injectable()
export class PatientService {
  private readonly logger = new Logger(PatientService.name);

  constructor(
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly hisConfig: HisConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  // -- Lookup by MRN --------------------------------------------------------
  async getByMrn(mrn: string): Promise<HisPatient> {
    const cacheKey = CACHE_KEYS.PATIENT(mrn);
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as HisPatient;

    this.assertAvailable();
    const cfg    = await this.hisConfig.getConfig();
    const rawSql = cfg['sql.patient.getByMrn']?.trim();

    // D.4 ("Dynamic Per-Tenant HIS Query Architecture"): both branches below
    // perform the same logical operation from the caller's perspective, so
    // both pass the same `queryId` -- `CloudOracleTransport` uses this
    // directly as the dispatched `sqlTemplateId` (bypassing its exact-SQL
    // allow-list), while `DirectOracleTransport`/self-hosted mode ignores it
    // and executes the literal `sql` string exactly as before. See
    // `HisQueryTemplateCompiler`'s `patient.getByMrn` registry entry for the
    // cloud-side definition this queryId corresponds to.
    let row: Record<string, unknown> | null;
    if (rawSql) {
      try {
        row = await this.oracle.queryOne<Record<string, unknown>>(rawSql, { mrn }, { queryId: 'patient.getByMrn' });
      } catch (rawErr: any) {
        // ORA-00904 = invalid column name, ORA-00942 = table/view doesn't exist
        // Both mean the configured sql.patient.getByMrn has schema mismatches.
        // Fall back to config-based SQL and log a clear warning, mirroring the
        // same fallback already applied in search() above.
        const code = String(rawErr?.message ?? '');
        if (code.includes('ORA-00904') || code.includes('ORA-00942')) {
          this.logger.warn(
            `[PatientService.getByMrn] Raw SQL (sql.patient.getByMrn) failed — schema mismatch: ${rawErr.message}. ` +
            `Falling back to config-based SQL. Fix the "sql.patient.getByMrn" entry in Vendor Portal → HIS Config.`,
          );
          const { select, joins } = buildPatientSelect(cfg);
          const sql = `${select} WHERE p.${cfg['patient.col.mrn']} = :mrn ${joins}`;
          row = await this.oracle.queryOne<Record<string, unknown>>(sql, { mrn }, { queryId: 'patient.getByMrn' });
        } else {
          throw rawErr;
        }
      }
    } else {
      const { select, joins } = buildPatientSelect(cfg);
      const sql = `${select} WHERE p.${cfg['patient.col.mrn']} = :mrn ${joins}`;
      row = await this.oracle.queryOne<Record<string, unknown>>(sql, { mrn }, { queryId: 'patient.getByMrn' });
    }

    if (!row) throw new NotFoundException(`Patient MRN ${mrn} not found in HIS`);

    const patient = this.mapPatient(row);
    await this.redis.setex(cacheKey, PATIENT_CACHE_TTL, JSON.stringify(patient));
    return patient;
  }

  // -- Search ----------------------------------------------------------------
  async search(term: string, limit = 20): Promise<HisSearchResult[]> {
    const cacheKey = `his:search:${Buffer.from(term.toLowerCase()).toString('base64')}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as HisSearchResult[];

    this.assertAvailable();
    const cfg    = await this.hisConfig.getConfig();
    const rawSql = cfg['sql.patient.search']?.trim();

    // NOTE: Oracle forbids reserved words as bind variable names.
    // ':like' → ORA-01745 because LIKE is a keyword. Use ':nameMatch' instead.
    // ':lim'  → ORA-01745 in FETCH FIRST clauses. Replace with the literal integer.
    const nameMatch = `%${term.toUpperCase()}%`;
    let rows: Record<string, unknown>[];

    // D.5 ("Dynamic Per-Tenant HIS Query Architecture"): all three branches
    // below pass the same queryId -- see `HisQueryTemplateCompiler`'s
    // `patient.search` registry entry and its doc comment for the one
    // disclosed limitation this queryId still carries (a raw override using
    // `:lim` inside `FETCH FIRST` fails under cloud-relay mode; unchanged by
    // this migration, already documented there, not something this call
    // site can fix by itself).
    if (rawSql) {
      const safeLim     = Math.max(1, Math.floor(Number(limit) || 20));
      const resolvedSql = rawSql
        .replace(/:lim\b/gi,  String(safeLim))   // Oracle rejects :lim in FETCH FIRST
        .replace(/:like\b/gi, ':nameMatch');      // LIKE is a reserved word in Oracle
      try {
        rows = await this.oracle.query<Record<string, unknown>>(
          resolvedSql, { term: term.toUpperCase(), nameMatch }, { maxRows: safeLim, queryId: 'patient.search' },
        );
      } catch (rawErr: any) {
        // ORA-00904 = invalid column name, ORA-00942 = table/view doesn't exist
        // Both mean the configured sql.patient.search has schema mismatches.
        // Fall back to config-based SQL and log a clear warning.
        const code = String(rawErr?.message ?? '');
        if (code.includes('ORA-00904') || code.includes('ORA-00942')) {
          this.logger.warn(
            `[PatientService.search] Raw SQL (sql.patient.search) failed — schema mismatch: ${rawErr.message}. ` +
            `Falling back to config-based SQL. Fix the "sql.patient.search" entry in Vendor Portal → HIS Config.`,
          );
          rows = await this.oracle.query<Record<string, unknown>>(
            buildPatientSearchSql(cfg), { term: term.toUpperCase(), nameMatch }, { maxRows: safeLim, queryId: 'patient.search' },
          );
        } else {
          throw rawErr;
        }
      }
    } else {
      rows = await this.oracle.query<Record<string, unknown>>(
        buildPatientSearchSql(cfg), { term: term.toUpperCase(), nameMatch }, { maxRows: limit, queryId: 'patient.search' },
      );
    }

    // Oracle returns column aliases in UPPERCASE when not double-quoted.
    // Normalize every key to lowercase so the mapping works for both raw SQL
    // (uppercase aliases) and our config-based SQL (quoted lowercase aliases).
    const norm = (r: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(r)) out[k.toLowerCase()] = r[k];
      return out;
    };

    // Also handle common alias variants the raw SQL might use (e.g. FULL_NAME vs fullname)
    const pick = (r: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) {
        if (r[k] !== undefined && r[k] !== null) return String(r[k]);
      }
      return '';
    };

    const results: HisSearchResult[] = rows.map((raw) => {
      const r = norm(raw);
      return {
        mrn:              pick(r, 'mrn', 'uhid', 'patient_id', 'pat_id', 'patientid'),
        fullName:         pick(r, 'fullname', 'full_name', 'patientname', 'patient_name', 'name'),
        gender:           pick(r, 'gender', 'sex', 'gendername'),
        dateOfBirth:      pick(r, 'dateofbirth', 'date_of_birth', 'dob', 'birthdate'),
        mobile:           pick(r, 'mobile', 'mobileno', 'mobile_no', 'phone', 'contactno') || null,
        registrationDate: pick(r, 'registrationdate', 'registration_date', 'regdate', 'reg_date', 'createddatetime'),
      };
    });

    await this.redis.setex(cacheKey, SEARCH_CACHE_TTL, JSON.stringify(results));
    return results;
  }

  // -- Cache invalidation ----------------------------------------------------
  async invalidateCache(mrn: string): Promise<void> {
    await this.redis.del(CACHE_KEYS.PATIENT(mrn));
  }

  // -- Helpers ---------------------------------------------------------------
  private assertAvailable(): void {
    if (!this.oracle.isAvailable) {
      throw new ServiceUnavailableException('HIS integration is currently unavailable');
    }
  }

  private mapPatient(rawRow: Record<string, unknown>): HisPatient {
    // Oracle returns column aliases in UPPERCASE unless double-quoted — normalize to lowercase
    const row: Record<string, unknown> = {};
    for (const k of Object.keys(rawRow)) row[k.toLowerCase()] = rawRow[k];

    // Helper: try multiple alias variants for the same logical field
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null) return String(row[k]);
      }
      return '';
    };

    return {
      mrn:              pick('mrn', 'uhid', 'patient_id', 'pat_id', 'patientid'),
      salutation:       pick('salutation', 'sal', 'title') || null,
      firstName:        pick('firstname', 'first_name', 'fname', 'patfirstname'),
      middleName:       pick('middlename', 'middle_name', 'mname') || null,
      lastName:         pick('lastname', 'last_name', 'lname', 'patlastname'),
      fullName:         pick('fullname', 'full_name', 'patientname', 'patient_name', 'name'),
      gender:           (pick('gender', 'sex', 'gendername') || 'O') as 'M' | 'F' | 'O',
      dateOfBirth:      pick('dateofbirth', 'date_of_birth', 'dob', 'birthdate'),
      age:              row['age'] !== undefined && row['age'] !== null ? Number(row['age']) : null,
      bloodGroup:       pick('bloodgroup', 'blood_group', 'bg') || null,
      mobile:           pick('mobile', 'mobileno', 'mobile_no', 'phone', 'contactno') || null,
      email:            pick('email', 'emailid', 'email_id') || null,
      address:          pick('address', 'addr', 'addressline1') || null,
      city:             pick('city', 'cityname', 'city_name') || null,
      state:            pick('state', 'statename', 'state_name') || null,
      pinCode:          pick('pincode', 'pin_code', 'pin', 'zipcode') || null,
      aadhaarLast4:     pick('aadhaar last4', 'aadhaarlast4') || null,
      registrationDate: pick('registrationdate', 'registration_date', 'regdate', 'reg_date', 'createddatetime'),
      isActive:         Number(row['isactiveflag'] ?? row['is_active'] ?? 1) === 1,
    };
  }
}
