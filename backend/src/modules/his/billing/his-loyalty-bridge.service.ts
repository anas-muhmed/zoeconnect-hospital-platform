import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';

export interface LoyaltySummaryPayload {
  // Patient / account identifiers
  patientMrn:          string;
  patientName:         string;
  cardNumber:          string;
  tierCode:            string;   // SILVER | GOLD | PLATINUM
  tierName:            string;
  loyaltyStatus:       string;   // ACTIVE | SUSPENDED | CLOSED

  // Point counters (from loyalty_accounts)
  totalLifetimeSpend:  number;
  totalPointsEarned:   number;
  totalPointsRedeemed: number;
  availablePoints:     number;

  // Pre-computed by PointEngineService in the calling service
  redeemableAmount:    number;   // Rs. monetary value of available points
  discountPct:         number;   // current applicable discount %

  // Last transaction context
  lastBillId:          string | null;
  lastBillAmount:      number | null;
  lastBillDate:        Date   | null;
  lastTxnType:         'EARN' | 'REDEEM' | 'ADJUST' | 'REVERSE';
}

/**
 * HisLoyaltyBridgeService
 *
 * Keeps the Oracle table LOYALTY_PATIENT_SUMMARY in sync with the loyalty
 * module's Postgres state.  Called fire-and-forget after every earn / redeem
 * commit so the HIS billing UI always sees fresh data without coupling its
 * queries to the Postgres loyalty DB.
 *
 * Query the table from HIS:
 *   SELECT * FROM LOYALTY_PATIENT_SUMMARY WHERE PATIENT_MRN = :mrn
 */
@Injectable()
export class HisLoyaltyBridgeService implements OnModuleInit {
  private readonly logger = new Logger(HisLoyaltyBridgeService.name);

  constructor(
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
  ) {}

  onModuleInit() {
    // If this line never appears in logs, the service was never instantiated
    this.logger.log(`[BRIDGE] HisLoyaltyBridgeService INSTANTIATED — oracleAvailable=${this.oracle.isAvailable}`);
  }

  /**
   * Direct write test — inserts / updates a TEST row and returns the result.
   * Call via GET /his/sync/test-bridge to verify the Oracle write path works.
   * Removes the TEST row after the check.
   */
  async testWrite(): Promise<{ success: boolean; rowsAffected: number; error?: string }> {
    if (!this.oracle.isAvailable) {
      return { success: false, rowsAffected: 0, error: 'Oracle pool not available (isAvailable=false)' };
    }
    try {
      const mergeSql = `
        MERGE INTO LOYALTY_PATIENT_SUMMARY tgt
        USING DUAL
        ON (tgt.PATIENT_MRN = :mrn)
        WHEN MATCHED THEN
          UPDATE SET PATIENT_NAME = :patientName, LAST_UPDATED = SYSTIMESTAMP
        WHEN NOT MATCHED THEN
          INSERT (PATIENT_MRN, PATIENT_NAME, CARD_NUMBER, TIER_CODE, TIER_NAME,
                  TOTAL_LIFETIME_SPEND, TOTAL_POINTS_EARNED, TOTAL_POINTS_REDEEMED,
                  AVAILABLE_POINTS, REDEEMABLE_AMOUNT, DISCOUNT_PCT,
                  LAST_TXN_TYPE, LOYALTY_STATUS, LAST_UPDATED, CREATED_AT)
          VALUES (:mrn, :patientName, 'TEST-CARD', 'SILVER', 'Silver',
                  0, 0, 0, 0, 0, 0, 'EARN', 'ACTIVE', SYSTIMESTAMP, SYSTIMESTAMP)
      `;
      const rows = await this.oracle.execute(mergeSql, {
        mrn: '__HDSP_BRIDGE_TEST__',
        patientName: 'Bridge Write Test',
      });

      // Clean up the test row
      await this.oracle.execute(
        `DELETE FROM LOYALTY_PATIENT_SUMMARY WHERE PATIENT_MRN = '__HDSP_BRIDGE_TEST__'`,
        {},
      );

      this.logger.log(`Oracle bridge write test PASSED — rowsAffected=${rows}`);
      return { success: true, rowsAffected: rows };
    } catch (err) {
      const error = (err as Error).message;
      this.logger.error(`Oracle bridge write test FAILED: ${error}`);
      return { success: false, rowsAffected: 0, error };
    }
  }

  /**
   * Upsert one row into LOYALTY_PATIENT_SUMMARY.
   * Never throws — if Oracle is unavailable the error is logged and swallowed
   * so the main loyalty flow is never blocked by a bridge failure.
   */
  async upsertLoyaltySummary(payload: LoyaltySummaryPayload): Promise<void> {
    // DIAGNOSTIC: always log entry so we know if the bridge is being called
    this.logger.log(
      `[BRIDGE] upsertLoyaltySummary called — MRN=${payload.patientMrn} oracleAvailable=${this.oracle.isAvailable}`,
    );

    if (!this.oracle.isAvailable) {
      this.logger.warn(
        `HIS Oracle unavailable — skipping loyalty summary upsert for MRN ${payload.patientMrn}`,
      );
      return;
    }

    try {
      const {
        patientMrn, patientName, cardNumber, tierCode, tierName, loyaltyStatus,
        totalLifetimeSpend, totalPointsEarned, totalPointsRedeemed, availablePoints,
        redeemableAmount, discountPct,
        lastBillId, lastBillAmount, lastBillDate, lastTxnType,
      } = payload;

      /*
       * Oracle MERGE — insert on first visit, update on subsequent ones.
       * All bind variables use :name syntax (oracledb positional or named binds).
       */
      const mergeSql = `
        MERGE INTO LOYALTY_PATIENT_SUMMARY tgt
        USING DUAL
        ON (tgt.PATIENT_MRN = :mrn)
        WHEN MATCHED THEN
          UPDATE SET
            PATIENT_NAME          = :patientName,
            CARD_NUMBER           = :cardNumber,
            TIER_CODE             = :tierCode,
            TIER_NAME             = :tierName,
            TOTAL_LIFETIME_SPEND  = :totalLifetimeSpend,
            TOTAL_POINTS_EARNED   = :totalPointsEarned,
            TOTAL_POINTS_REDEEMED = :totalPointsRedeemed,
            AVAILABLE_POINTS      = :availablePoints,
            REDEEMABLE_AMOUNT     = :redeemableAmount,
            DISCOUNT_PCT          = :discountPct,
            LAST_BILL_ID          = :lastBillId,
            LAST_BILL_AMOUNT      = :lastBillAmount,
            LAST_BILL_DATE        = :lastBillDate,
            LAST_TXN_TYPE         = :lastTxnType,
            LOYALTY_STATUS        = :loyaltyStatus,
            LAST_UPDATED          = SYSTIMESTAMP
        WHEN NOT MATCHED THEN
          INSERT (
            PATIENT_MRN,
            PATIENT_NAME,
            CARD_NUMBER,
            TIER_CODE,
            TIER_NAME,
            TOTAL_LIFETIME_SPEND,
            TOTAL_POINTS_EARNED,
            TOTAL_POINTS_REDEEMED,
            AVAILABLE_POINTS,
            REDEEMABLE_AMOUNT,
            DISCOUNT_PCT,
            LAST_BILL_ID,
            LAST_BILL_AMOUNT,
            LAST_BILL_DATE,
            LAST_TXN_TYPE,
            LOYALTY_STATUS,
            LAST_UPDATED,
            CREATED_AT
          ) VALUES (
            :mrn,
            :patientName,
            :cardNumber,
            :tierCode,
            :tierName,
            :totalLifetimeSpend,
            :totalPointsEarned,
            :totalPointsRedeemed,
            :availablePoints,
            :redeemableAmount,
            :discountPct,
            :lastBillId,
            :lastBillAmount,
            :lastBillDate,
            :lastTxnType,
            :loyaltyStatus,
            SYSTIMESTAMP,
            SYSTIMESTAMP
          )
      `;

      const binds = {
        mrn: patientMrn,
        patientName,
        cardNumber,
        tierCode,
        tierName,
        totalLifetimeSpend,
        totalPointsEarned,
        totalPointsRedeemed,
        availablePoints,
        redeemableAmount,
        discountPct,
        lastBillId:    lastBillId    ?? null,
        lastBillAmount: lastBillAmount ?? null,
        lastBillDate:  lastBillDate  ?? null,
        lastTxnType,
        loyaltyStatus,
      };

      const rowsAffected = await this.oracle.execute(mergeSql, binds);

      this.logger.debug(
        `LOYALTY_PATIENT_SUMMARY upserted for MRN=${patientMrn} ` +
        `(rowsAffected=${rowsAffected}, txn=${lastTxnType}, points=${availablePoints})`,
      );
    } catch (err) {
      // Non-critical — log and swallow so the loyalty flow is never blocked
      this.logger.error(
        `Failed to upsert LOYALTY_PATIENT_SUMMARY for MRN ${payload.patientMrn}: ` +
        `${(err as Error).message}`,
      );
    }
  }
}
