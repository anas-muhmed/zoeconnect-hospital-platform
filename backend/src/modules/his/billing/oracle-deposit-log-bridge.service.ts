import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';

/**
 * OracleDepositLogBridgeService
 *
 * Keeps the DEPOSIT_AMOUNT of a patient's active Oracle loyalty deposit
 * ("Block") record in sync with the redeemable balance ZoeConnect just
 * calculated. This is the ONLY thing ZoeConnect does to DEPOSIT_LOG.
 *
 * Ownership split (confirmed with the HIS billing owner — see
 * Oracle_Loyalty_Deposit_Sync_Analysis_v2.docx §2):
 *   - Oracle HIS owns the entire DEPOSIT_LOG lifecycle. It creates the
 *     initial DEPOSIT_TYPE=13 / DEPOSIT_STATUS='Block' row when loyalty is
 *     enabled for a patient, and on every redemption it flips the previous
 *     Block row to UnBlock and inserts a brand new Block row holding the
 *     remaining balance. ZoeConnect never inserts, deletes, or changes the
 *     status of a DEPOSIT_LOG row.
 *   - ZoeConnect owns loyalty point/balance calculation (PointEngineService) and
 *     is only responsible for pushing the freshly calculated redeemable
 *     amount onto whichever row Oracle currently has marked as the active
 *     Block for that patient.
 *
 * Oracle HIS invariant this service relies on: at any point in time there
 * is at most one DEPOSIT_LOG row per patient with DEPOSIT_TYPE=13 AND
 * DEPOSIT_STATUS='Block'. Oracle HIS is solely responsible for maintaining
 * that invariant. If this ever turns out not to hold for a given tenant's
 * HIS version, the WHERE clause below needs to be narrowed (e.g. by
 * VISIT/SITE) — see the "verify uniqueness" note in the design doc.
 *
 * Ordering rule: callers must only invoke this AFTER their Postgres
 * loyalty transaction has committed successfully. If the Postgres
 * transaction rolls back, this must never be called — Oracle's Block
 * amount must only ever reflect a balance ZoeConnect has durably committed.
 *
 * Failure handling: never throws. Logs and returns on any error (Oracle
 * unavailable, statement failure, zero rows matched). This mirrors the
 * DEPOSIT_TYPE=13 amount into Oracle. There is no dedicated retry queue
 * for this write — it is a derived/idempotent value, so the next loyalty
 * recalculation (next bill, next redemption, next sync tick) naturally
 * re-attempts it. This intentionally differs from HisLoyaltyBridgeService,
 * which does use a Redis retry queue for LOYALTY_PATIENT_SUMMARY writes.
 */
@Injectable()
export class OracleDepositLogBridgeService {
  private readonly logger = new Logger(OracleDepositLogBridgeService.name);

  private static readonly LOYALTY_DEPOSIT_TYPE = 13;

  constructor(
    @Optional() @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport | null,
  ) {}

  /**
   * Update the DEPOSIT_AMOUNT of the patient's currently active loyalty
   * Block record to the latest calculated redeemable amount.
   *
   * Single statement — no SELECT-then-UPDATE round trip, since the
   * DEPOSIT_LOG_ID isn't needed for anything other than logging.
   *
   * @param patientId Oracle-side patient identifier used to key DEPOSIT_LOG.PATIENT_ID.
   *                   Sourced from the same identifier (MRN/UHID) this codebase's other
   *                   HIS services already bind as the patient join key (see
   *                   BillingService/PatientService). If a given tenant's DEPOSIT_LOG uses
   *                   a different internal PATIENT_ID than the MRN/UHID used elsewhere,
   *                   this bind — and the WHERE clause's uniqueness assumption — should be
   *                   revisited before enabling this sync for that tenant.
   * @param redeemableAmount Latest value from PointEngineService.computeDiscount().cardValue.
   */
  async syncActiveBlockAmount(patientId: string, redeemableAmount: number): Promise<void> {
    if (!this.oracle) {
      this.logger.warn(
        `[DEPOSIT] syncActiveBlockAmount skipped — Oracle transport not injected (patientId=${patientId})`,
      );
      return;
    }
    if (!this.oracle.isAvailable) {
      this.logger.warn(
        `[DEPOSIT] Oracle unavailable — skipping deposit sync for patientId=${patientId}. ` +
        `Will retry on the next loyalty recalculation (no dedicated retry queue for this write).`,
      );
      return;
    }

    try {
      // Oracle stores this as a currency amount — guard against floating-point
      // artifacts from computeDiscount()'s arithmetic (e.g. 742.49999999997)
      // by rounding to 2 decimal places before it ever leaves ZoeConnect.
      const roundedAmount = Number(redeemableAmount.toFixed(2));

      // NVL(DEPOSIT_AMOUNT, -1) <> :redeemableAmount skips the write entirely
      // when Oracle already holds the value ZoeConnect is about to push — avoids
      // redo/undo generation, audit-trigger churn, and row locking for a
      // genuine no-op (e.g. a repeat sync tick with no balance change). This
      // is an optimization only; it never changes which row is targeted.
      const sql = `
        UPDATE DEPOSIT_LOG
        SET    DEPOSIT_AMOUNT = :redeemableAmount
        WHERE  PATIENT_ID     = :patientId
          AND  DEPOSIT_TYPE   = ${OracleDepositLogBridgeService.LOYALTY_DEPOSIT_TYPE}
          AND  DEPOSIT_STATUS = 'Block'
          AND  NVL(DEPOSIT_AMOUNT, -1) <> :redeemableAmount
      `;

      const rowsAffected = await this.oracle.execute(sql, { patientId, redeemableAmount: roundedAmount });

      if (rowsAffected === 0) {
        // Two indistinguishable-by-design possibilities, both harmless:
        //   (a) no active Block row exists yet for this patient (HIS hasn't
        //       enrolled them into the deposit lifecycle) or the PATIENT_ID
        //       binding doesn't match this tenant's DEPOSIT_LOG, or
        //   (b) an active Block row exists and already holds this exact
        //       amount — the NVL(...) <> filter above skipped a genuine no-op.
        // ZoeConnect does not create a row here in either case — that stays Oracle
        // HIS's responsibility. Logged at debug (not warn) specifically
        // because (b) is an expected, frequent outcome, not an anomaly.
        this.logger.debug(
          `[DEPOSIT] 0 rows updated for patientId=${patientId} (amount=${roundedAmount}) — ` +
          `either no active Block row exists, or Oracle already holds this amount.`,
        );
        return;
      }

      if (rowsAffected > 1) {
        // The Oracle HIS invariant this design relies on (§5.3 of the design
        // doc) is that there is at most one active Block row per patient for
        // DEPOSIT_TYPE=13. If more than one row was updated, that invariant
        // has been violated for this tenant/HIS version — surface it loudly
        // rather than silently updating multiple rows.
        this.logger.error(
          `[DEPOSIT] Oracle HIS invariant violated — expected exactly one active Block row ` +
          `(DEPOSIT_TYPE=13) for patientId=${patientId}, but rowsAffected=${rowsAffected}. ` +
          `The WHERE clause may need narrowing (e.g. by VISIT/SITE) for this tenant.`,
        );
        return;
      }

      this.logger.debug(
        `[DEPOSIT] Active Block row updated — patientId=${patientId} amount=${roundedAmount} rowsAffected=${rowsAffected}`,
      );
    } catch (err) {
      // Non-critical — log and continue. Never blocks the loyalty flow that
      // already committed in Postgres. Oracle drivers occasionally throw
      // non-Error values (strings, driver-specific objects), so don't assume
      // `err` is an Error instance.
      this.logger.error(
        `[DEPOSIT] Failed to update active Block row for patientId=${patientId}: ${OracleDepositLogBridgeService.errorMessage(err)}`,
      );
    }
  }

  /**
   * Diagnostic-only check — confirms whether an active Block row exists for
   * a patient, without modifying anything. Used by the
   * GET /his/sync/test-deposit-bridge/:patientId admin endpoint, so ops can
   * confirm the PATIENT_ID binding and current balance without querying
   * Oracle directly.
   */
  async findActiveBlockAmount(patientId: string): Promise<{
    patientId: string;
    found: boolean;
    currentDepositAmount: number | null;
    depositType: number;
    status: 'Block' | null;
    matchCount: number;
  }> {
    const notFound = {
      patientId,
      found: false,
      currentDepositAmount: null,
      depositType: OracleDepositLogBridgeService.LOYALTY_DEPOSIT_TYPE,
      status: null,
      matchCount: 0,
    };
    if (!this.oracle?.isAvailable) return notFound;
    try {
      const rows = await this.oracle.query<{ DEPOSIT_AMOUNT: number }>(
        `SELECT DEPOSIT_AMOUNT
         FROM   DEPOSIT_LOG
         WHERE  PATIENT_ID     = :patientId
           AND  DEPOSIT_TYPE   = ${OracleDepositLogBridgeService.LOYALTY_DEPOSIT_TYPE}
           AND  DEPOSIT_STATUS = 'Block'`,
        { patientId },
      );
      if (!rows.length) return notFound;
      if (rows.length > 1) {
        this.logger.warn(
          `[DEPOSIT] findActiveBlockAmount: patientId=${patientId} has ${rows.length} active Block rows ` +
          `(expected at most 1) — Oracle HIS invariant appears violated for this tenant.`,
        );
      }
      return {
        patientId,
        found: true,
        currentDepositAmount: Number(rows[0].DEPOSIT_AMOUNT),
        depositType: OracleDepositLogBridgeService.LOYALTY_DEPOSIT_TYPE,
        status: 'Block',
        matchCount: rows.length,
      };
    } catch (err) {
      this.logger.error(`[DEPOSIT] findActiveBlockAmount failed for patientId=${patientId}: ${OracleDepositLogBridgeService.errorMessage(err)}`);
      return notFound;
    }
  }

  /**
   * Safely extract a message from a caught value. Oracle client libraries
   * (and some driver internals) occasionally throw strings or plain objects
   * rather than Error instances, so a blind `(err as Error).message` cast
   * can itself throw or yield "undefined" in logs.
   */
  private static errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
}
