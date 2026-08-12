import { resolveColumn, buildLookupJoins } from '../his-config.helpers';

/**
 * billing.templates.ts (D.1, DYNAMIC_HIS_QUERY_ARCHITECTURE.md §4/§9).
 *
 * Pure extraction of `BillingService.buildBillSelect()` -- see
 * `patient.templates.ts`'s doc comment for the shared rationale (single
 * source of truth reused by the business service today and a future
 * cloud-side compiler later; zero behavior change here).
 */
export function buildBillSelect(cfg: Record<string, string>): { select: string; joins: string } {
  const tBill = cfg['billing.table'];

  const deptNameExpr   = resolveColumn(cfg, 'billing', 'dept',   'b', 'lkp_dept');
  const doctorNameExpr = resolveColumn(cfg, 'billing', 'doctor', 'b', 'lkp_doc');

  const joins = buildLookupJoins(cfg, [
    ['billing', 'dept',   'b', 'lkp_dept'],
    ['billing', 'doctor', 'b', 'lkp_doc'],
  ]);

  const deptCodeExpr = `b.${cfg['billing.col.deptCode']}`;
  const docCodeExpr  = `b.${cfg['billing.col.doctorCode']}`;

  const select = `
    SELECT
      b.${cfg['billing.col.billId']}         AS "billId",
      b.${cfg['billing.col.mrn']}            AS "mrn",
      b.${cfg['billing.col.patientName']}    AS "patientName",
      b.${cfg['billing.col.visitId']}        AS "visitId",
      TO_CHAR(b.${cfg['billing.col.billDate']}, 'YYYY-MM-DD"T"HH24:MI:SS') AS "billDate",
      b.${cfg['billing.col.billType']}       AS "billType",
      b.${cfg['billing.col.totalAmount']}    AS "totalAmount",
      b.${cfg['billing.col.paidAmount']}     AS "paidAmount",
      b.${cfg['billing.col.balanceAmount']}  AS "balanceAmount",
      b.${cfg['billing.col.discountAmount']} AS "discountAmount",
      b.${cfg['billing.col.status']}         AS "status",
      ${docCodeExpr}                         AS "doctorCode",
      ${doctorNameExpr}                      AS "doctorName",
      ${deptCodeExpr}                        AS "departmentCode",
      ${deptNameExpr}                        AS "departmentName"
    FROM ${tBill} b
  `;

  return { select, joins };
}

/**
 * D.5 extraction (2026-07-22): `BillingService.getBillById()`'s header
 * lookup, factored out the same way `patient.getByMrn` factored
 * `buildPatientSelect()` -- a single, canonical SQL string with no
 * runtime-option-driven shape variability (`billId` is a genuine bind, not
 * a compile-time branch), so it fits this architecture's "one queryId = one
 * canonical compiled definition" invariant without any further changes.
 */
export function buildBillByIdSql(cfg: Record<string, string>): string {
  const { select, joins } = buildBillSelect(cfg);
  return `${select} ${joins} WHERE b.${cfg['billing.col.billId']} = :billId`;
}

/**
 * D.5 extraction (2026-07-22): `BillingService.getBillById()`'s line-items
 * query, previously inlined directly in the service (no D.1 builder
 * existed for it). Same "single canonical SQL, billId is the only bind"
 * shape as `buildBillByIdSql()` above -- no runtime-option branching to
 * convert.
 */
export function buildBillItemsSql(cfg: Record<string, string>): string {
  const tBillItems = cfg['billItems.table'];
  return `
    SELECT
      bi.${cfg['billItems.col.itemCode']}  AS "itemCode",
      bi.${cfg['billItems.col.itemName']}  AS "itemName",
      bi.${cfg['billItems.col.quantity']}  AS "quantity",
      bi.${cfg['billItems.col.unitPrice']} AS "unitPrice",
      bi.${cfg['billItems.col.amount']}    AS "amount",
      bi.${cfg['billItems.col.deptCode']}  AS "departmentCode",
      bi.${cfg['billItems.col.deptName']}  AS "departmentName"
    FROM ${tBillItems} bi
    WHERE bi.${cfg['billItems.col.billId']} = :billId
    ORDER BY bi.${cfg['billItems.col.serialNo']}
  `;
}
