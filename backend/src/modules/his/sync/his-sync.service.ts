import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectRedis } from '../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { BillingService }          from '../billing/billing.service';
import { PatientService }          from '../patient/patient.service';
import { HisConfigService }        from '../config/his-config.service';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { HisLoyaltyBridgeService } from '../billing/his-loyalty-bridge.service';
import { OracleDepositLogBridgeService } from '../billing/oracle-deposit-log-bridge.service';
import { EnrollmentService }       from '../../loyalty/services/enrollment.service';
import { TransactionService }      from '../../loyalty/services/transaction.service';
import { PointEngineService }      from '../../loyalty/services/point-engine.service';

// ─────────────────────────────────────────────────────────────────────────────
//  REDIS KEY — sync cursor
//
//  Key  : his:sync:bill_cursor
//  Type : ISO-8601 date-time string  (e.g. "2026-06-20T10:30:00.000Z")
//  Scope: persisted across app restarts so no bills are re-processed
//
//  On first boot (key absent) the cursor defaults to HIS_SYNC_LOOKBACK_DAYS
//  ago (default 30 days).  Set HIS_SYNC_LOOKBACK_DAYS=0 in .env to start
//  from "now" and only process future bills.
// ─────────────────────────────────────────────────────────────────────────────
const CURSOR_KEY = 'his:sync:bill_cursor';

// ─────────────────────────────────────────────────────────────────────────────
//  ORACLE TABLE & COLUMN REFERENCE SUMMARY
//  (All column-level notes are also inline in BillingService.getNewFinalizedBills)
//
//  Table: BILL_MASTER  (billing header — one row per bill)
//    BILL_NO      → unique bill ID used as idempotency key in loyalty_transactions.reference_id
//    UHID         → patient MRN; used to look up / auto-create loyalty_accounts.patient_mrn
//    PATIENT_NAME → patient name cached at enrollment if HIS PAT_MASTER is unavailable
//    BILL_DATE    → date of the bill (informational; not used for cursor)
//    TOTAL_AMT    → gross amount; used to calculate loyalty points (1 pt per ₹100)
//    BILL_STATUS  → only 'FINALISED' rows are processed; adjust to your HIS value
//    UPDATED_AT   → cursor column; drives incremental polling — MUST be indexed
//
//  Table: PAT_MASTER  (patient demographics — queried via PatientService.getByMrn)
//    UHID         → patient MRN (primary key used in lookup)
//    FIRST_NAME, LAST_NAME  → assembled into fullName
//    DOB          → date of birth; stored in loyalty_accounts.patient_dob (birthday campaigns)
//    MOBILE_NO    → stored in loyalty_accounts.patient_mobile (WhatsApp notifications)
//    GENDER       → stored in loyalty_accounts.patient_gender
//
//  PostgreSQL Tables Written:
//    loyalty_accounts      — auto-created when a patient is seen for the first time
//      enrolled_by         → NULL (system auto-enrollment)
//    loyalty_transactions  — one EARN row per processed bill
//      reference_type      → 'BILL'
//      reference_id        → BILL_MASTER.BILL_NO  (idempotency key)
//      created_by          → NULL (HIS sync)
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HisSyncService {
  private readonly logger = new Logger(HisSyncService.name);

  // Minimum bill amount to earn points (₹0 = all bills eligible).
  // Tune via env or card-config in future.
  private readonly MIN_BILL_AMOUNT = 0;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly billingService:     BillingService,
    private readonly patientService:     PatientService,
    private readonly hisConfigService:   HisConfigService,
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly enrollmentService:  EnrollmentService,
    private readonly transactionService: TransactionService,
    private readonly pointEngine:        PointEngineService,
    @Optional() @Inject(HisLoyaltyBridgeService) private readonly hisBridge: HisLoyaltyBridgeService | null,
    @Optional() @Inject(OracleDepositLogBridgeService) private readonly depositBridge: OracleDepositLogBridgeService | null,
  ) {}

  // ── Main entry — called by HisSyncScheduler every 10 seconds ─────────────
  //
  //  Three scenarios are handled in a single pass:
  //
  //  1. EARN   — bill is FINALISED and has never been processed
  //              → earn points, push Oracle
  //
  //  2. ADJUST — bill is FINALISED but was previously processed with a
  //              different amount (edited + re-approved in HIS)
  //              → compute delta, post ADJUST transaction, push Oracle
  //
  //  3. REVERSE— bill is CANCELLED / REVERSED and was previously processed
  //              → negate the original points, post REVERSE transaction, push Oracle
  //
  //  The cursor advances to the highest UPDATED_AT seen in each batch, ensuring
  //  no status change is ever missed, regardless of when it happens.
  async syncNewBills(): Promise<void> {
    // 1. Read cursor from Redis (or bootstrap default)
    const cursor = await this.getCursor();

    // 2. Fetch ALL bills whose UPDATED_AT changed since the cursor.
    //    This includes FINALISED (new + amended) AND CANCELLED/REVERSED bills.
    //    Max 200 per cycle — self-advancing on the next tick if Oracle returns 200.
    let bills: Awaited<ReturnType<BillingService['getChangedBills']>>;
    try {
      bills = await this.billingService.getChangedBills(cursor, 200);
    } catch (err) {
      this.logger.warn(`HIS unavailable during sync: ${(err as Error).message}`);
      return;
    }

    if (!bills.length) return;

    this.logger.log(`HIS sync: ${bills.length} changed bills since ${cursor.toISOString()}`);

    // Retrieve HIS status config values once (avoid per-bill config lookups)
    const cfg          = await this.hisConfigService.getConfig();
    const STATUS_FINAL    = (cfg['billing.status.finalised'] ?? 'FINALISED').toUpperCase();
    const STATUS_SETTLED  = (cfg['billing.status.settled']   ?? 'SETTLED').toUpperCase();
    const STATUS_CANCEL   = (cfg['billing.status.cancelled'] ?? 'CANCELLED').toUpperCase();
    const STATUS_REVERSED = (cfg['billing.status.reversed']  ?? 'REVERSED').toUpperCase();

    const isFinalised = (s: string) =>
      s.toUpperCase() === STATUS_FINAL || s.toUpperCase() === STATUS_SETTLED;
    const isCancelled = (s: string) =>
      s.toUpperCase() === STATUS_CANCEL || s.toUpperCase() === STATUS_REVERSED;

    let earned   = 0;
    let adjusted = 0;
    let reversed = 0;
    let latestUpdatedAt = cursor;

    for (const bill of bills) {
      try {
        // Advance cursor based on bill's updatedAt (use billDate as proxy since
        // the query orders by UPDATED_AT; the cursor will naturally advance)
        const billDate = new Date(bill.billDate);
        if (billDate > latestUpdatedAt) latestUpdatedAt = billDate;

        // ── SCENARIO 3: CANCELLED / REVERSED ──────────────────────────────
        if (isCancelled(bill.status)) {
          const result = await this.transactionService.reverseFromBill(
            bill.billId,
            bill.mrn,
            null,  // HIS system action
          );
          if (result) {
            reversed++;
            this.logger.log(
              `REVERSE: bill ${bill.billId} cancelled — ${result.pointsReversed} pts reversed for MRN ${bill.mrn}`,
            );
          } else {
            this.logger.debug(`REVERSE: bill ${bill.billId} — no EARN found or already reversed, skipping`);
          }
          continue;
        }

        // ── Only process FINALISED bills beyond this point ─────────────────
        if (!isFinalised(bill.status)) {
          this.logger.debug(`Bill ${bill.billId} status=${bill.status} — not actionable, skipping`);
          continue;
        }

        // ── Auto-enroll patient (idempotent) ───────────────────────────────
        const account = await this.autoEnrollPatient(bill.mrn, bill.patientName);
        if (!account) continue;

        // Skip bills below the minimum amount — push Oracle snapshot only
        if (Number(bill.totalAmount) < this.MIN_BILL_AMOUNT) {
          this.pushAccountToOracle(account, bill.billId, bill.totalAmount, null, 'EARN');
          continue;
        }

        // ── Check if this bill was previously processed ────────────────────
        const existingEarn = await this.transactionService.findEarnByBillId(bill.billId);

        if (!existingEarn) {
          // ── SCENARIO 1: EARN — new bill, never processed ─────────────────
          await this.transactionService.earnFromBill(
            {
              identifier:  bill.mrn,
              billId:      bill.billId,
              billAmount:  bill.totalAmount,
              description: `Auto-sync from HIS bill ${bill.billId}`,
            },
            null,
          );
          earned++;

        } else {
          // ── SCENARIO 2: ADJUST — bill amount changed ──────────────────────
          //  Compare stored bill amount vs current Oracle amount.
          //  adjustFromBill() is a no-op if amounts match (within ₹1 tolerance).
          const result = await this.transactionService.adjustFromBill(
            bill.billId,
            bill.mrn,
            bill.totalAmount,
            null,
          );
          if (result) {
            adjusted++;
            this.logger.log(
              `ADJUST: bill ${bill.billId} amended — delta ${result.pointsDelta > 0 ? '+' : ''}${result.pointsDelta} pts for MRN ${bill.mrn}`,
            );
          } else {
            // Amount unchanged — just refresh Oracle so the table stays current
            this.pushAccountToOracle(account, bill.billId, bill.totalAmount, new Date(bill.billDate), 'EARN');
          }
        }

      } catch (err: unknown) {
        const msg = (err as Error).message ?? '';
        if (msg.includes('inactive')) continue;
        this.logger.error(`Sync error for bill ${bill.billId} (MRN ${bill.mrn}): ${msg}`);
      }
    }

    // 4. Advance cursor — add 1 ms to avoid re-processing the boundary row
    const newCursor = new Date(latestUpdatedAt.getTime() + 1);
    await this.saveCursor(newCursor);

    // Flush any queued Oracle retries now that we've finished the batch
    await this.flushOracleRetryQueue();

    this.logger.log(
      `HIS sync complete — earned=${earned} adjusted=${adjusted} reversed=${reversed}. ` +
      `Cursor → ${newCursor.toISOString()}`,
    );
  }

  // ── Auto-enroll patient if not yet in loyalty_accounts ───────────────────
  private async autoEnrollPatient(mrn: string, billPatientName: string) {
    try {
      // Try to fetch full demographics from PAT_MASTER
      // Columns used: UHID, FIRST_NAME, LAST_NAME, DOB, MOBILE_NO, GENDER
      let patientName = billPatientName;
      let patientDob: string | null = null;
      let patientMobile: string | null = null;
      let patientGender: string | null = null;

      try {
        const his = await this.patientService.getByMrn(mrn);
        patientName   = his.fullName   || billPatientName;
        patientDob    = his.dateOfBirth ?? null;
        patientMobile = his.mobile      ?? null;
        patientGender = his.gender      ?? null;
      } catch {
        // PAT_MASTER lookup failed — use name from BILL_MASTER as fallback
        this.logger.debug(`PAT_MASTER unavailable for MRN ${mrn}; using BILL_MASTER name`);
      }

      // enrollOrGet is idempotent — returns existing account without throwing
      return await this.enrollmentService.enrollOrGet(
        mrn,
        patientName,
        patientMobile,
        patientDob,
        patientGender,
      );
    } catch (err) {
      this.logger.error(`Auto-enroll failed for MRN ${mrn}: ${(err as Error).message}`);
      return null;
    }
  }

  // ── Oracle bridge helper ─────────────────────────────────────────────────
  // Pushes a snapshot of the account to LOYALTY_PATIENT_SUMMARY.
  // On failure the payload is pushed to a Redis retry queue so the next
  // sync tick re-attempts the write automatically.
  private pushAccountToOracle(
    account: import('../../loyalty/entities/loyalty-account.entity').LoyaltyAccount,
    lastBillId: string,
    lastBillAmount: number,
    lastBillDate: Date | null,
    txnType: 'EARN' | 'REDEEM' | 'ADJUST' | 'REVERSE' = 'EARN',
  ): void {
    if (!this.hisBridge) {
      this.logger.warn(`[BRIDGE] pushAccountToOracle skipped — hisBridge is NULL (MRN=${account.patientMrn})`);
      return;
    }
    if (!account.category) {
      this.logger.warn(`[BRIDGE] pushAccountToOracle skipped — account.category is NULL (MRN=${account.patientMrn})`);
      return;
    }
    const discountResult = this.pointEngine.computeDiscount(
      Number(account.availablePoints),
      account.category,
    );
    const payload: import('../billing/his-loyalty-bridge.service').LoyaltySummaryPayload = {
      patientMrn:          account.patientMrn,
      patientName:         account.patientName,
      cardNumber:          account.cardNumber,
      tierCode:            account.category.code,
      tierName:            account.category.name,
      loyaltyStatus:       account.status,
      totalLifetimeSpend:  Number(account.totalLifetimeSpend),
      totalPointsEarned:   Number(account.totalPointsEarned),
      totalPointsRedeemed: Number(account.totalPointsRedeemed),
      availablePoints:     Number(account.availablePoints),
      redeemableAmount:    discountResult.cardValue,
      discountPct:         discountResult.discountPct,
      lastBillId,
      lastBillAmount,
      lastBillDate,
      lastTxnType:         txnType,
    };
    this.hisBridge.upsertLoyaltySummary(payload).catch((err) => {
      // Push to retry queue so the next sync tick retries the write
      this.queueOracleRetry(payload).catch(() => {});
      this.logger.warn(`[BRIDGE] Oracle write failed for MRN=${account.patientMrn}, queued for retry: ${(err as Error).message}`);
    });

    // Sync the latest redeemable balance onto Oracle's active DEPOSIT_LOG
    // Block row (DEPOSIT_TYPE=13). Oracle HIS owns the row lifecycle — ZoeConnect
    // only updates the amount. No dedicated retry queue for this write (see
    // OracleDepositLogBridgeService doc comment); the next sync tick that
    // touches this account naturally re-attempts it.
    if (this.depositBridge) {
      this.depositBridge
        .syncActiveBlockAmount(account.patientMrn, discountResult.cardValue)
        .catch(() => { /* already logged inside bridge */ });
    }
  }


  // ── Oracle retry queue (Redis list) ──────────────────────────────────────
  private readonly ORACLE_RETRY_KEY = 'his:oracle:retry';
  private readonly ORACLE_RETRY_MAX = 50;

  private async queueOracleRetry(
    payload: import('../billing/his-loyalty-bridge.service').LoyaltySummaryPayload,
  ): Promise<void> {
    const len = await this.redis.llen(this.ORACLE_RETRY_KEY);
    if (len >= this.ORACLE_RETRY_MAX) {
      this.logger.warn(`[BRIDGE] Retry queue full (${len}) — dropping oldest`);
      await this.redis.lpop(this.ORACLE_RETRY_KEY);
    }
    await this.redis.rpush(this.ORACLE_RETRY_KEY, JSON.stringify(payload));
  }

  // Called at end of every sync tick to re-attempt previously failed Oracle writes
  async flushOracleRetryQueue(): Promise<void> {
    if (!this.hisBridge || !this.oracle.isAvailable) return;
    const len = await this.redis.llen(this.ORACLE_RETRY_KEY);
    if (!len) return;
    this.logger.log(`[BRIDGE] Flushing ${len} queued Oracle retry writes`);
    const batch = Math.min(len, 20);
    for (let i = 0; i < batch; i++) {
      const raw = await this.redis.lpop(this.ORACLE_RETRY_KEY);
      if (!raw) break;
      try {
        const p = JSON.parse(raw) as import('../billing/his-loyalty-bridge.service').LoyaltySummaryPayload;
        await this.hisBridge.upsertLoyaltySummary(p);
        this.logger.debug(`[BRIDGE] Retry succeeded for MRN=${p.patientMrn}`);
      } catch (err) {
        await this.redis.lpush(this.ORACLE_RETRY_KEY, raw);
        this.logger.warn(`[BRIDGE] Retry still failing — re-queued: ${(err as Error).message}`);
        break;
      }
    }
  }

  // ── Cursor management ─────────────────────────────────────────────────────
  private async getCursor(): Promise<Date> {
    const stored = await this.redis.get(CURSOR_KEY);
    if (stored) return new Date(stored);
    const lookbackDays = parseInt(process.env['HIS_SYNC_LOOKBACK_DAYS'] ?? '30', 10);
    const defaultCursor = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    this.logger.log(
      `HIS sync cursor not found in Redis. Starting from ${defaultCursor.toISOString()} ` +
      `(HIS_SYNC_LOOKBACK_DAYS=${lookbackDays})`,
    );
    await this.saveCursor(defaultCursor);
    return defaultCursor;
  }

  private async saveCursor(date: Date): Promise<void> {
    await this.redis.set(CURSOR_KEY, date.toISOString());
  }

  async resetCursor(fromDate: Date): Promise<void> {
    await this.saveCursor(fromDate);
    this.logger.warn(`HIS sync cursor manually reset to ${fromDate.toISOString()}`);
  }

  async getCursorInfo(): Promise<{ cursor: string; key: string }> {
    const cursor = await this.getCursor();
    return { cursor: cursor.toISOString(), key: CURSOR_KEY };
  }

  async triggerImmediateBackfill(fromDate = new Date('2000-01-01')): Promise<{
    ok: boolean;
    cursorReset: string;
    message: string;
    diagnostics: {
      oracleConnected: boolean;
      configKeysLoaded: number;
      syncSqlConfigured: boolean;
      hint: string | null;
    };
  }> {
    await this.resetCursor(fromDate);
    try {
      await this.syncNewBills();
    } catch (err) {
      this.logger.warn(`Immediate backfill cycle failed (scheduler will retry): ${(err as Error).message}`);
    }
    const diag = await this.diagnose();
    return {
      ok: true,
      cursorReset: fromDate.toISOString(),
      message: `Cursor reset to ${fromDate.toISOString()}. Full historical sync running — patients appear every 10 seconds until all are loaded.`,
      diagnostics: diag,
    };
  }

  async diagnose(): Promise<{
    oracleConnected: boolean;
    configKeysLoaded: number;
    syncSqlConfigured: boolean;
    hint: string | null;
    oracle?: {
      invoiceTableRowCount: number | null;
      sampleStatuses: string[] | null;
      testQueryError: string | null;
    };
  }> {
    const oracleConnected = this.oracle.isAvailable;
    let configKeysLoaded = 0;
    let syncSqlConfigured = false;
    try {
      const cfg = await this.hisConfigService.getConfig();
      configKeysLoaded  = Object.keys(cfg).length;
      syncSqlConfigured = !!(cfg['sql.billing.sync']?.trim());
    } catch { /* his_schema_configs missing */ }

    let invoiceTableRowCount: number | null = null;
    let sampleStatuses: string[] | null = null;
    let testQueryError: string | null = null;

    if (oracleConnected) {
      try {
        const countRow = await this.oracle.queryOne<Record<string, unknown>>(
          `SELECT COUNT(*) AS "total" FROM INS_MASTER_INVOICE`,
        );
        invoiceTableRowCount = countRow ? Number(countRow['total'] ?? 0) : 0;
        const statusRows = await this.oracle.query<Record<string, unknown>>(
          `SELECT DISTINCT INVOICE_STATUS AS "status" FROM INS_MASTER_INVOICE WHERE ROWNUM <= 100`,
          {},
          { maxRows: 20 },
        );
        sampleStatuses = statusRows.map(r => String(r['status'] ?? r['STATUS'] ?? '')).filter(Boolean);
      } catch (err) {
        testQueryError = (err as Error).message;
      }
    }

    let hint: string | null = null;
    if (!oracleConnected) {
      hint = 'Oracle HIS is not connected. Check ORACLE_HOST/PORT/SERVICE in .env.';
    } else if (configKeysLoaded === 0) {
      hint = 'No HIS schema config found. Push config from the vendor portal HIS Config page.';
    } else if (!syncSqlConfigured) {
      hint = `Oracle connected, ${configKeysLoaded} config keys loaded, but sql.billing.sync is not set. Push SQL from vendor portal.`;
    } else if (testQueryError) {
      hint = `Oracle connected but test query failed: ${testQueryError}`;
    } else if (invoiceTableRowCount === 0) {
      hint = 'INS_MASTER_INVOICE table is empty — no bills to sync.';
    } else if (sampleStatuses && sampleStatuses.length > 0) {
      hint = `Oracle has ${invoiceTableRowCount} rows. Actual INVOICE_STATUS values: ${sampleStatuses.join(', ')}. Check if sql.billing.sync WHERE clause matches these values.`;
    }

    return {
      oracleConnected,
      configKeysLoaded,
      syncSqlConfigured,
      hint,
      oracle: oracleConnected ? { invoiceTableRowCount, sampleStatuses, testQueryError } : undefined,
    };
  }
}
