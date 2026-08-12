import { Test, TestingModule } from '@nestjs/testing';
import {
  HisQueryTemplateCompiler,
  UnknownQueryIdError,
  IncompleteSchemaConfigError,
} from '../his-query-template-compiler.service';
import { HisConfigService } from '../his-config.service';

/**
 * D.2 compiler tests (DYNAMIC_HIS_QUERY_ARCHITECTURE.md §9's D.4 test
 * pattern applied one phase early, since this class is unit-testable in
 * isolation without any Connector/gateway involved -- exactly the "D.2
 * ... unit-testable in isolation" note in the design doc's phasing
 * section).
 */

const FULL_CFG: Record<string, string> = {
  // patient
  'patient.table': 'PAT_MASTER',
  'patient.col.mrn': 'MRN',
  'patient.col.salutation': 'PREFIX',
  'patient.col.firstName': 'FIRST_NAME',
  'patient.col.middleName': 'MIDDLE_NAME',
  'patient.col.lastName': 'LAST_NAME',
  'patient.col.gender': 'GENDER',
  'patient.col.dob': 'DOB',
  'patient.col.bloodGroup': 'BLOOD_GROUP',
  'patient.col.mobile': 'MOBILE',
  'patient.col.email': 'EMAIL',
  'patient.col.address': 'ADDRESS',
  'patient.col.city': 'CITY',
  'patient.col.state': 'STATE',
  'patient.col.pinCode': 'PIN_CODE',
  'patient.col.aadhaar': 'AADHAAR',
  'patient.col.regDate': 'REG_DATE',
  'patient.col.status': 'STATUS',
  'patient.status.active': 'A',
  // billing
  'billing.table': 'BILL_MASTER',
  'billing.col.billId': 'BILL_ID',
  'billing.col.mrn': 'MRN',
  'billing.col.patientName': 'PATIENT_NAME',
  'billing.col.visitId': 'VISIT_ID',
  'billing.col.billDate': 'BILL_DATE',
  'billing.col.billType': 'BILL_TYPE',
  'billing.col.totalAmount': 'TOTAL_AMOUNT',
  'billing.col.paidAmount': 'PAID_AMOUNT',
  'billing.col.balanceAmount': 'BALANCE_AMOUNT',
  'billing.col.discountAmount': 'DISCOUNT_AMOUNT',
  'billing.col.status': 'STATUS',
  'billing.col.deptCode': 'DEPT_CODE',
  'billing.col.doctorCode': 'DOCTOR_CODE',
  'billing.col.dept': 'DEPT_CODE',
  'billing.col.doctor': 'DOCTOR_CODE',
  // billing: line items (D.5 extraction, buildBillItemsSql)
  'billItems.table': 'BILL_ITEMS',
  'billItems.col.itemCode': 'ITEM_CODE',
  'billItems.col.itemName': 'ITEM_NAME',
  'billItems.col.quantity': 'QUANTITY',
  'billItems.col.unitPrice': 'UNIT_PRICE',
  'billItems.col.amount': 'AMOUNT',
  'billItems.col.deptCode': 'DEPT_CODE',
  'billItems.col.deptName': 'DEPT_NAME',
  'billItems.col.billId': 'BILL_ID',
  'billItems.col.serialNo': 'SERIAL_NO',
  // visit
  'visit.table': 'VISIT_MASTER',
  'visit.col.visitId': 'VISIT_ID',
  'visit.col.mrn': 'MRN',
  'visit.col.visitDate': 'VISIT_DATE',
  'visit.col.admissionDate': 'ADMISSION_DATE',
  'visit.col.dischargeDate': 'DISCHARGE_DATE',
  'visit.col.doctorCode': 'DOCTOR_CODE',
  'visit.col.bed': 'BED',
  'visit.col.diagnosis': 'DIAGNOSIS',
  'visit.col.status': 'STATUS',
  'visit.col.deptCode': 'DEPT_CODE',
  'visit.col.visitType': 'VISIT_TYPE',
  'visit.col.ward': 'WARD',
  'visit.col.dept': 'DEPT_CODE',
  'visit.col.doctor': 'DOCTOR_CODE',
  // reference: department
  'department.table': 'DEPT_MASTER',
  'department.col.code': 'DEPT_CODE',
  'department.col.name': 'DEPT_NAME',
  'department.col.shortCode': 'SHORT_CODE',
  'department.col.status': 'STATUS',
  'department.status.active': 'A',
  'department.col.type': 'DEPT_TYPE',
  // reference: doctor
  'doctor.table': 'DOCTOR_MASTER',
  'doctor.col.code': 'DOC_CODE',
  'doctor.col.name': 'DOC_NAME',
  'doctor.col.qualification': 'QUALIFICATION',
  'doctor.col.deptCode': 'DEPT_CODE',
  'doctor.col.status': 'STATUS',
  'doctor.status.active': 'A',
  'doctor.col.specialization': 'SPECIALIZATION',
  'doctor.col.dept': 'DEPT_CODE',
};

async function createCompiler(cfg: Record<string, string>) {
  const hisConfig = { getConfig: jest.fn().mockResolvedValue(cfg) };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      HisQueryTemplateCompiler,
      { provide: HisConfigService, useValue: hisConfig },
    ],
  }).compile();
  return { compiler: module.get(HisQueryTemplateCompiler), hisConfig };
}

describe('HisQueryTemplateCompiler', () => {
  it('lists exactly the registered queryIds', async () => {
    const { compiler } = await createCompiler(FULL_CFG);
    expect(compiler.listQueryIds().sort()).toEqual([
      'billing.getBillById',
      'billing.getBillsByMrn',
      'billing.getLineItems',
      'patient.getByMrn',
      'patient.search',
      'reference.departments',
      'reference.doctors',
      'visit.getByMrn',
    ]);
  });

  it.each([
    'patient.getByMrn',
    'patient.search',
    'billing.getBillsByMrn',
    'billing.getBillById',
    'billing.getLineItems',
    'visit.getByMrn',
    'reference.departments',
    'reference.doctors',
  ])('compiles %s from a complete config without error', async (queryId) => {
    const { compiler } = await createCompiler(FULL_CFG);
    const def = await compiler.compile('tenant-1', queryId);
    expect(def.queryId).toBe(queryId);
    expect(def.kind).toBe('query');
    expect(def.sql).toEqual(expect.any(String));
    expect(def.sql.length).toBeGreaterThan(0);
    expect(def.checksum).toMatch(/^[0-9a-f]{16}$/);
    expect(def.compiledAt).toEqual(expect.any(String));
  });

  it('throws UnknownQueryIdError for an unregistered queryId', async () => {
    const { compiler } = await createCompiler(FULL_CFG);
    await expect(compiler.compile('tenant-1', 'patient.deleteEverything')).rejects.toThrow(UnknownQueryIdError);
  });

  it('throws IncompleteSchemaConfigError when a required config key is missing', async () => {
    const incomplete = { ...FULL_CFG };
    delete incomplete['patient.table']; // -> "FROM undefined p" in the compiled SQL
    const { compiler } = await createCompiler(incomplete);
    await expect(compiler.compile('tenant-1', 'patient.getByMrn')).rejects.toThrow(IncompleteSchemaConfigError);
  });

  it('produces a stable checksum for the same config, across repeated calls', async () => {
    const { compiler } = await createCompiler(FULL_CFG);
    const first = await compiler.compile('tenant-1', 'patient.getByMrn');
    const second = await compiler.compile('tenant-1', 'patient.getByMrn');
    expect(second.checksum).toBe(first.checksum);
    expect(second.sql).toBe(first.sql);
  });

  it('produces a different checksum when the tenant config actually differs', async () => {
    const { compiler: compilerA } = await createCompiler(FULL_CFG);
    const defA = await compilerA.compile('tenant-a', 'patient.getByMrn');

    const differentCfg = { ...FULL_CFG, 'patient.table': 'DIFFERENT_PAT_TABLE' };
    const { compiler: compilerB } = await createCompiler(differentCfg);
    const defB = await compilerB.compile('tenant-b', 'patient.getByMrn');

    expect(defB.checksum).not.toBe(defA.checksum);
  });

  it('compiles a tenant raw SQL override verbatim instead of the config-driven builder', async () => {
    const overrideCfg = {
      ...FULL_CFG,
      'sql.patient.getByMrn': 'SELECT mrn AS "mrn" FROM CUSTOM_PATIENT_VIEW WHERE mrn = :mrn',
    };
    const { compiler } = await createCompiler(overrideCfg);
    const def = await compiler.compile('tenant-1', 'patient.getByMrn');
    expect(def.sql).toBe(overrideCfg['sql.patient.getByMrn']);
  });

  // D.5 fix (2026-07-22): `visit.getByMrn`/`reference.departments`/
  // `reference.doctors` used to let a caller-supplied `parameters` value
  // change the compiled SQL's TEXT (a clause present or absent) -- this
  // test previously asserted exactly that ("withFilter" vs "withoutFilter"
  // producing different SQL). That's now recognized as incompatible with
  // "one queryId = one canonical compiled definition" (see
  // `visit.templates.ts`'s and `reference.templates.ts`'s D.5 doc
  // comments): the Publisher compiles with no per-request parameters at
  // all, so a shape-varying builder meant only ONE variant was ever
  // actually published, silently dropping the filter for every other
  // variant under cloud-relay mode. Fixed by making all three builders
  // pure functions of `cfg` alone -- `parameters` no longer affects their
  // SQL text, which this test now asserts directly (the inverse of the
  // old assertion).
  it.each(['visit.getByMrn', 'reference.departments', 'reference.doctors'])(
    '%s compiles to identical SQL regardless of caller-supplied parameters (bind-driven, not shape-driven)',
    async (queryId) => {
      const { compiler } = await createCompiler(FULL_CFG);
      const withParams = await compiler.compile('tenant-1', queryId, {
        visitType: 'OPD', activeOnly: false, deptCode: 'CARD',
      });
      const withoutParams = await compiler.compile('tenant-1', queryId, {});
      expect(withParams.sql).toBe(withoutParams.sql);
      expect(withParams.checksum).toBe(withoutParams.checksum);
    },
  );

  it('visit.getByMrn always includes the bind-driven visitType predicate in its compiled SQL', async () => {
    const { compiler } = await createCompiler(FULL_CFG);
    const def = await compiler.compile('tenant-1', 'visit.getByMrn');
    expect(def.sql).toContain(':visitType IS NULL');
    expect(def.expectedBinds).toContain('visitType');
  });

  it('reference.departments always includes the bind-driven activeOnly predicate in its compiled SQL', async () => {
    const { compiler } = await createCompiler(FULL_CFG);
    const def = await compiler.compile('tenant-1', 'reference.departments');
    expect(def.sql).toContain(':activeOnly = 0');
    expect(def.expectedBinds).toContain('activeOnly');
  });

  it('reference.doctors always includes the bind-driven deptCode predicate in its compiled SQL', async () => {
    const { compiler } = await createCompiler(FULL_CFG);
    const def = await compiler.compile('tenant-1', 'reference.doctors');
    expect(def.sql).toContain(':deptCode IS NULL');
    expect(def.expectedBinds).toContain('deptCode');
  });
});
