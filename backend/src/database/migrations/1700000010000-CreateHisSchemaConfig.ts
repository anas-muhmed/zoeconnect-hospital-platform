import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 010 — Create his_schema_configs table
 *
 * PURPOSE:
 *   Stores per-hospital mappings from HDSP's internal config keys to
 *   the real Oracle HIS table/column names. The vendor platform pushes
 *   these values via the HIS_CONFIG_UPDATE webhook event.
 *
 * TABLE: his_schema_configs
 *   id           — UUID PK
 *   config_key   — Internal dot-notation key (e.g. "billing.table")
 *   config_value — Resolved Oracle identifier (e.g. "BILL_MASTER")
 *   updated_at   — Last time this row was pushed from the vendor portal
 *
 * SEEDED DEFAULTS:
 *   All ~70 default placeholder values are seeded on creation so that
 *   HDSP can operate before the vendor admin configures real names.
 *   A push from the vendor portal will overwrite these via UPSERT.
 *
 * UNIQUE CONSTRAINT: (config_key) — one row per logical key
 */
export class CreateHisSchemaConfig1700000010000 implements MigrationInterface {
  name = 'CreateHisSchemaConfig1700000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Create table ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "his_schema_configs" (
        "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
        "config_key"   VARCHAR(120) NOT NULL,
        "config_value" VARCHAR(255) NOT NULL,
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_his_schema_configs" PRIMARY KEY ("id"),
        CONSTRAINT "uq_his_schema_configs_key" UNIQUE ("config_key")
      )
    `);

    // ── Seed all default values ─────────────────────────────────────────────
    // These are placeholder names used in code when no real schema has been
    // pushed. The vendor admin replaces them via the HIS Schema Config page
    // in the vendor portal and clicks "Push to Hospital".
    const defaults: Array<[string, string]> = [
      // PATIENT
      ['patient.table',           'PAT_MASTER'],
      ['patient.col.mrn',         'UHID'],
      ['patient.col.salutation',  'SALUTATION'],
      ['patient.col.firstName',   'FIRST_NAME'],
      ['patient.col.middleName',  'MIDDLE_NAME'],
      ['patient.col.lastName',    'LAST_NAME'],
      ['patient.col.gender',      'GENDER'],
      ['patient.col.dob',         'DOB'],
      ['patient.col.bloodGroup',  'BLOOD_GROUP'],
      ['patient.col.mobile',      'MOBILE_NO'],
      ['patient.col.email',       'EMAIL_ID'],
      ['patient.col.address',     'ADDRESS_LINE1'],
      ['patient.col.city',        'CITY'],
      ['patient.col.state',       'STATE'],
      ['patient.col.pinCode',     'PIN_CODE'],
      ['patient.col.aadhaar',     'AADHAAR_NO'],
      ['patient.col.regDate',     'REG_DATE'],
      ['patient.col.status',      'STATUS'],
      ['patient.status.active',   'A'],

      // BILLING
      ['billing.table',              'BILL_MASTER'],
      ['billing.col.billId',         'BILL_NO'],
      ['billing.col.mrn',            'UHID'],
      ['billing.col.patientName',    'PATIENT_NAME'],
      ['billing.col.visitId',        'VISIT_ID'],
      ['billing.col.billDate',       'BILL_DATE'],
      ['billing.col.billType',       'BILL_TYPE'],
      ['billing.col.totalAmount',    'TOTAL_AMT'],
      ['billing.col.paidAmount',     'PAID_AMT'],
      ['billing.col.balanceAmount',  'BALANCE_AMT'],
      ['billing.col.discountAmount', 'DISCOUNT_AMT'],
      ['billing.col.status',         'BILL_STATUS'],
      ['billing.col.doctorCode',     'DOCTOR_CODE'],
      ['billing.col.doctorName',     'DOCTOR_NAME'],
      ['billing.col.deptCode',       'DEPT_CODE'],
      ['billing.col.deptName',       'DEPT_NAME'],
      ['billing.col.updatedAt',      'UPDATED_AT'],
      ['billing.status.finalised',   'FINALISED'],
      ['billing.status.cancelled',   'CANCELLED'],
      ['billing.status.reversed',    'REVERSED'],

      // BILL ITEMS
      ['billItems.table',         'BILL_ITEMS'],
      ['billItems.col.billId',    'BILL_NO'],
      ['billItems.col.itemCode',  'ITEM_CODE'],
      ['billItems.col.itemName',  'ITEM_NAME'],
      ['billItems.col.quantity',  'QUANTITY'],
      ['billItems.col.unitPrice', 'UNIT_PRICE'],
      ['billItems.col.amount',    'AMOUNT'],
      ['billItems.col.deptCode',  'DEPT_CODE'],
      ['billItems.col.deptName',  'DEPT_NAME'],
      ['billItems.col.serialNo',  'SL_NO'],

      // VISIT
      ['visit.table',              'VISIT_MASTER'],
      ['visit.col.visitId',        'VISIT_ID'],
      ['visit.col.mrn',            'UHID'],
      ['visit.col.visitDate',      'VISIT_DATE'],
      ['visit.col.visitType',      'VISIT_TYPE'],
      ['visit.col.admissionDate',  'ADMISSION_DATE'],
      ['visit.col.dischargeDate',  'DISCHARGE_DATE'],
      ['visit.col.doctorCode',     'DOCTOR_CODE'],
      ['visit.col.doctorName',     'DOCTOR_NAME'],
      ['visit.col.deptCode',       'DEPT_CODE'],
      ['visit.col.deptName',       'DEPT_NAME'],
      ['visit.col.ward',           'WARD_NAME'],
      ['visit.col.bed',            'BED_NO'],
      ['visit.col.diagnosis',      'DIAGNOSIS'],
      ['visit.col.status',         'VISIT_STATUS'],

      // DEPARTMENT
      ['department.table',          'DEPARTMENT_MASTER'],
      ['department.col.code',       'DEPT_CODE'],
      ['department.col.name',       'DEPT_NAME'],
      ['department.col.shortCode',  'SHORT_CODE'],
      ['department.col.type',       'DEPT_TYPE'],
      ['department.col.status',     'STATUS'],
      ['department.status.active',  'A'],

      // DOCTOR
      ['doctor.table',              'DOCTOR_MASTER'],
      ['doctor.col.code',           'DOCTOR_CODE'],
      ['doctor.col.name',           'DOCTOR_NAME'],
      ['doctor.col.specialization', 'SPECIALIZATION'],
      ['doctor.col.deptCode',       'DEPT_CODE'],
      ['doctor.col.deptName',       'DEPT_NAME'],
      ['doctor.col.qualification',  'QUALIFICATION'],
      ['doctor.col.status',         'STATUS'],
      ['doctor.status.active',      'A'],

      // ── LOOKUP / FK JOIN KEYS (empty = plain column, no join) ─────────────
      // Seeded as empty strings so HisConfigService returns '' for absent lookups.
      // The services check: if cfg['x.lookup.y.table'] is truthy → JOIN; else plain column.

      // PATIENT lookups
      ['patient.lookup.salutation.table',  ''],
      ['patient.lookup.salutation.fk',     ''],
      ['patient.lookup.salutation.value',  ''],
      ['patient.lookup.gender.table',      ''],
      ['patient.lookup.gender.fk',         ''],
      ['patient.lookup.gender.value',      ''],
      ['patient.lookup.bloodGroup.table',  ''],
      ['patient.lookup.bloodGroup.fk',     ''],
      ['patient.lookup.bloodGroup.value',  ''],

      // BILLING lookups
      ['billing.lookup.dept.table',        ''],
      ['billing.lookup.dept.fk',           ''],
      ['billing.lookup.dept.value',        ''],
      ['billing.lookup.doctor.table',      ''],
      ['billing.lookup.doctor.fk',         ''],
      ['billing.lookup.doctor.value',      ''],

      // VISIT lookups
      ['visit.lookup.visitType.table',     ''],
      ['visit.lookup.visitType.fk',        ''],
      ['visit.lookup.visitType.value',     ''],
      ['visit.lookup.ward.table',          ''],
      ['visit.lookup.ward.fk',             ''],
      ['visit.lookup.ward.value',          ''],
      ['visit.lookup.dept.table',          ''],
      ['visit.lookup.dept.fk',             ''],
      ['visit.lookup.dept.value',          ''],
      ['visit.lookup.doctor.table',        ''],
      ['visit.lookup.doctor.fk',           ''],
      ['visit.lookup.doctor.value',        ''],

      // DEPARTMENT lookups
      ['department.lookup.type.table',     ''],
      ['department.lookup.type.fk',        ''],
      ['department.lookup.type.value',     ''],

      // DOCTOR lookups
      ['doctor.lookup.specialization.table', ''],
      ['doctor.lookup.specialization.fk',   ''],
      ['doctor.lookup.specialization.value', ''],
      ['doctor.lookup.dept.table',           ''],
      ['doctor.lookup.dept.fk',             ''],
      ['doctor.lookup.dept.value',          ''],

      // ── RAW SQL QUERIES (empty = fall back to dynamic SQL builder) ────────
      // The vendor admin writes full Oracle SQL in the vendor portal.
      // HDSP executes it directly with named oracledb bind parameters.
      // Seeded as empty so the dynamic-SQL fallback stays active by default.
      ['sql.patient.getByMrn',      ''],
      ['sql.patient.search',        ''],
      ['sql.billing.getBillsByMrn', ''],
      ['sql.billing.sync',          ''],
      ['sql.billing.getLineItems',  ''],
      ['sql.visit.getByMrn',        ''],
      ['sql.reference.departments', ''],
      ['sql.reference.doctors',     ''],
    ];

    for (const [key, value] of defaults) {
      await queryRunner.query(
        `INSERT INTO "his_schema_configs" ("config_key", "config_value")
         VALUES ($1, $2)
         ON CONFLICT ("config_key") DO NOTHING`,
        [key, value],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "his_schema_configs"`);
  }
}
