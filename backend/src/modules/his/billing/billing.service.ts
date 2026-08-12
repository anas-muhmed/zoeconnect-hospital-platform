import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRedis } from '../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { HisConfigService } from '../config/his-config.service';
import { buildBillSelect, buildBillByIdSql, buildBillItemsSql } from '../config/query-templates/billing.templates';
import type { HisBill, HisBillItem } from '../his.types';
import { CACHE_KEYS } from '../../../config/redis.config';

const BILL_CACHE_TTL = 120;  // 2 minutes
const BILLS_LIST_TTL = 60;   // 1 minute

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly hisConfig: HisConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  // -- Bills by MRN ----------------------------------------------------------
  async getBillsByMrn(mrn: string, limit = 50): Promise<Omit<HisBill, 'items'>[]> {
    const cacheKey = `his:bills:${mrn}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    this.assertAvailable();
    const cfg    = await this.hisConfig.getConfig();
    const rawSql = cfg['sql.billing.getBillsByMrn']?.trim();

    // D.5 ("Dynamic Per-Tenant HIS Query Architecture"): both branches pass
    // the same queryId -- this is a pure-wiring case, not a new compiled
    // template. `mrn`/`lim` are both genuine runtime binds (no compile-time
    // SQL-shape branching in `HisQueryTemplateCompiler`'s `billing.getBillsByMrn`
    // entry, unlike `visit.getByMrn`/`reference.departments`/`reference.doctors`
    // -- see this session's D.5 scoping notes for why those three needed a
    // design fix first).
    let rows: Record<string, unknown>[];
    if (rawSql) {
      rows = await this.oracle.query<Record<string, unknown>>(
        rawSql, { mrn, lim: limit }, { maxRows: limit, queryId: 'billing.getBillsByMrn' },
      );
    } else {
      const { select, joins } = buildBillSelect(cfg);
      const sql = `
        SELECT * FROM (
          ${select}
          ${joins}
          WHERE b.${cfg['billing.col.mrn']} = :mrn
          ORDER BY b.${cfg['billing.col.billDate']} DESC
        ) WHERE ROWNUM <= :lim
      `;
      rows = await this.oracle.query<Record<string, unknown>>(
        sql, { mrn, lim: limit }, { maxRows: limit, queryId: 'billing.getBillsByMrn' },
      );
    }

    const bills = rows.map(this.mapBillSummary.bind(this));
    await this.redis.setex(cacheKey, BILLS_LIST_TTL, JSON.stringify(bills));
    return bills;
  }

  // -- Single bill with line items -------------------------------------------
  async getBillById(billId: string): Promise<HisBill> {
    const cacheKey = CACHE_KEYS.BILL(billId);
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as HisBill;

    this.assertAvailable();
    const cfg       = await this.hisConfig.getConfig();
    const rawHeader = cfg['sql.billing.getBillsByMrn']?.trim();
    const rawItems  = cfg['sql.billing.getLineItems']?.trim();

    // D.5 ("Dynamic Per-Tenant HIS Query Architecture"): both header and
    // line-items queries now pass a queryId. `buildBillByIdSql()`/
    // `buildBillItemsSql()` (extracted from this method's own previous
    // inline SQL, D.1-style) are byte-identical to what this method built
    // before -- see `billing.templates.ts`'s doc comment on both.
    let header: Record<string, unknown> | null;
    if (rawHeader) {
      const singleSql = `SELECT * FROM (${rawHeader}) WHERE "billId" = :billId`;
      header = await this.oracle.queryOne<Record<string, unknown>>(
        singleSql, { billId, mrn: '', lim: 1 }, { queryId: 'billing.getBillById' },
      );
    } else {
      const headerSql = buildBillByIdSql(cfg);
      header = await this.oracle.queryOne<Record<string, unknown>>(
        headerSql, { billId }, { queryId: 'billing.getBillById' },
      );
    }
    if (!header) throw new NotFoundException(`Bill ${billId} not found in HIS`);

    let itemRows: Record<string, unknown>[];
    if (rawItems) {
      itemRows = await this.oracle.query<Record<string, unknown>>(
        rawItems, { billId }, { queryId: 'billing.getLineItems' },
      );
    } else {
      const itemsSql = buildBillItemsSql(cfg);
      itemRows = await this.oracle.query<Record<string, unknown>>(
        itemsSql, { billId }, { queryId: 'billing.getLineItems' },
      );
    }

    const items: HisBillItem[] = itemRows.map((r) => ({
      itemCode:       String(r['itemCode'] ?? ''),
      itemName:       String(r['itemName'] ?? ''),
      quantity:       Number(r['quantity'] ?? 0),
      unitPrice:      Number(r['unitPrice'] ?? 0),
      amount:         Number(r['amount'] ?? 0),
      departmentCode: String(r['departmentCode'] ?? ''),
      departmentName: String(r['departmentName'] ?? ''),
    }));

    const bill: HisBill = { ...this.mapBillSummary(header), items };
    await this.redis.setex(cacheKey, BILL_CACHE_TTL, JSON.stringify(bill));
    return bill;
  }

  // -- Real-time sync: fetch bills since cursor ------------------------------
  async getNewFinalizedBills(since: Date, limit = 200): Promise<Omit<HisBill, 'items'>[]> {
    if (!this.oracle.isAvailable) return [];

    const cfg    = await this.hisConfig.getConfig();
    const rawSql = cfg['sql.billing.sync']?.trim();

    let rows: Record<string, unknown>[];
    if (rawSql) {
      // Pass `since` as a JS Date so oracledb binds it as an Oracle TIMESTAMP,
      // not as a VARCHAR string — a string bind against DATE/TIMESTAMP returns 0 rows.
      rows = await this.oracle.query<Record<string, unknown>>(
        rawSql, { since, lim: limit }, { maxRows: limit },
      );
    } else {
      const { select, joins } = buildBillSelect(cfg);
      const colStatus  = cfg['billing.col.status'];
      const colUpdAt   = cfg['billing.col.updatedAt'];
      const stFinal    = cfg['billing.status.finalised'];
      const stCancel   = cfg['billing.status.cancelled'];
      const stReversed = cfg['billing.status.reversed'];

      const sql = `
        SELECT * FROM (
          ${select}
          ${joins}
          WHERE b.${colStatus}  = '${stFinal}'
            AND b.${colStatus} NOT IN ('${stCancel}', '${stReversed}')
            AND b.${colUpdAt}  > :since
          ORDER BY b.${colUpdAt} ASC
        ) WHERE ROWNUM <= :lim
      `;
      rows = await this.oracle.query<Record<string, unknown>>(
        sql, { since, lim: limit }, { maxRows: limit },
      );
    }
    return rows.map(this.mapBillSummary.bind(this));
  }

  // -- Real-time sync: fetch ALL changed bills (any status) since cursor -----
  //
  //  This is the companion to getNewFinalizedBills(). It returns every bill
  //  whose UPDATED_AT changed since the cursor — regardless of status.
  //  The caller (HisSyncService) inspects the status and dispatches to:
  //    • EARN   — new finalised bill never seen before
  //    • ADJUST — finalised bill already processed but amount changed
  //    • REVERSE— cancelled/reversed bill that was previously processed
  //
  //  If the operator has set sql.billing.syncAll in HIS config, that raw SQL
  //  is used instead of the auto-built query so custom schemas are supported.
  async getChangedBills(since: Date, limit = 200): Promise<Omit<HisBill, 'items'>[]> {
    if (!this.oracle.isAvailable) return [];

    const cfg = await this.hisConfig.getConfig();

    // Priority 1: operator-supplied SQL that returns ALL statuses (recommended)
    const rawSyncAll = cfg['sql.billing.syncAll']?.trim();

    // Priority 2: fall back to the existing sync SQL (may only return FINALISED,
    //   but at least EARN still works; CANCEL/ADJUST need syncAll to be set)
    const rawSyncFallback = cfg['sql.billing.sync']?.trim();

    // Priority 3: auto-build using table/column config keys
    const hasBillingTable = !!cfg['billing.table']?.trim();

    let rows: Record<string, unknown>[];

    if (rawSyncAll) {
      // Full multi-status query configured by operator
      rows = await this.oracle.query<Record<string, unknown>>(
        rawSyncAll, { since, lim: limit }, { maxRows: limit },
      );
    } else if (rawSyncFallback) {
      // Use the existing sync SQL as-is — handles EARN at minimum.
      // To also handle CANCEL/ADJUST, set sql.billing.syncAll in HIS config
      // with a query that returns ALL bill statuses (remove the status=FINALISED filter).
      rows = await this.oracle.query<Record<string, unknown>>(
        rawSyncFallback, { since, lim: limit }, { maxRows: limit },
      );
    } else if (hasBillingTable) {
      // Auto-build from column config — no status filter so all changes are captured
      const { select, joins } = buildBillSelect(cfg);
      const colUpdAt = cfg['billing.col.updatedAt'];
      const sql = `
        SELECT * FROM (
          ${select}
          ${joins}
          WHERE b.${colUpdAt} > :since
          ORDER BY b.${colUpdAt} ASC
        ) WHERE ROWNUM <= :lim
      `;
      rows = await this.oracle.query<Record<string, unknown>>(
        sql, { since, lim: limit }, { maxRows: limit },
      );
    } else {
      // No usable config at all — return empty so the scheduler doesn't error
      this.logger.warn(
        'getChangedBills: no Oracle SQL configured (set sql.billing.syncAll or sql.billing.sync in HIS config)',
      );
      return [];
    }

    return rows.map(this.mapBillSummary.bind(this));
  }

  // -- Cache invalidation ----------------------------------------------------
  async invalidateBillCache(mrn: string, billId?: string): Promise<void> {
    await this.redis.del(`his:bills:${mrn}`);
    if (billId) await this.redis.del(CACHE_KEYS.BILL(billId));
  }

  // -- Helpers ---------------------------------------------------------------
  private assertAvailable(): void {
    if (!this.oracle.isAvailable) {
      throw new ServiceUnavailableException('HIS integration is currently unavailable');
    }
  }

  private mapBillSummary(r: Record<string, unknown>): Omit<HisBill, 'items'> {
    // Oracle returns column aliases in the exact case used in the SQL.
    // Normalise to a lowercase map so the rest of the code is case-insensitive.
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      row[k.toLowerCase()] = v;
    }

    return {
      billId:          String(row['billid']          ?? row['bill_id']          ?? ''),
      mrn:             String(row['mrn']             ?? ''),
      patientName:     String(row['patientname']     ?? row['patient_name']     ?? ''),
      visitId:         row['visitid'] ?? row['visit_id']
                         ? String(row['visitid'] ?? row['visit_id']) : null,
      billDate:        String(row['billdate']        ?? row['bill_date']        ?? ''),
      billType:        String(row['billtype']        ?? row['bill_type']        ?? 'OPD') as HisBill['billType'],
      totalAmount:     Number(row['totalamount']     ?? row['total_amount']     ?? 0),
      paidAmount:      Number(row['paidamount']      ?? row['paid_amount']      ?? 0),
      balanceAmount:   Number(row['balanceamount']   ?? row['balance_amount']   ?? 0),
      discountAmount:  Number(row['discountamount']  ?? row['discount_amount']  ?? 0),
      status:          String(row['status']          ?? 'PENDING')              as HisBill['status'],
      doctorCode:      row['doctorcode']   ?? row['doctor_code']   ? String(row['doctorcode']   ?? row['doctor_code'])   : null,
      doctorName:      row['doctorname']   ?? row['doctor_name']   ? String(row['doctorname']   ?? row['doctor_name'])   : null,
      departmentCode:  row['departmentcode'] ?? row['department_code'] ? String(row['departmentcode'] ?? row['department_code']) : null,
      departmentName:  row['departmentname'] ?? row['department_name'] ? String(row['departmentname'] ?? row['department_name']) : null,
    };
  }
}
