/**
 * Default Oracle HIS schema placeholders.
 * These are the names used in code when no hospital-specific mapping exists.
 * The vendor admin replaces these with the real Oracle identifiers per hospital.
 */
export interface HisSchemaEntry {
  key: string;
  defaultValue: string;
  label: string;
  description: string;
  configType: 'TABLE' | 'COLUMN' | 'STATUS_VALUE' | 'SQL_QUERY' | 'TEXT' | 'CREDENTIAL';
  category: string;
}

export const HIS_SCHEMA_DEFAULTS: HisSchemaEntry[] = [
  // ── DATABASE CONNECTION ───────────────────────────────────────────────────
  // These credentials are pushed to the ZoeConnect instance via the HIS_CONFIG_UPDATE
  // webhook. ZoeConnect uses them to create the Oracle connection pool at runtime.
  // Storing here means no credentials need to be hardcoded in any .env file.
  { key: 'db.host',     defaultValue: '',     label: 'Oracle DB Host',        description: 'Hostname or IP of the Oracle server. e.g. 192.168.1.10 or oracle.hospital.local',  configType: 'TEXT',       category: 'DB_CONNECTION' },
  { key: 'db.port',     defaultValue: '1521', label: 'Oracle DB Port',        description: 'Default Oracle listener port is 1521',                                               configType: 'TEXT',       category: 'DB_CONNECTION' },
  { key: 'db.service',  defaultValue: '',     label: 'Service Name / SID',    description: 'Oracle service name (preferred) or SID. e.g. HISDB, ORCLPDB1',                       configType: 'TEXT',       category: 'DB_CONNECTION' },
  { key: 'db.user',     defaultValue: '',     label: 'DB Username',           description: 'Oracle user with SELECT access to HIS tables. e.g. HDSP_READONLY',                    configType: 'TEXT',       category: 'DB_CONNECTION' },
  { key: 'db.password', defaultValue: '',     label: 'DB Password',           description: 'Password for the Oracle user. Stored encrypted at rest.',                             configType: 'CREDENTIAL', category: 'DB_CONNECTION' },
  { key: 'db.mode',     defaultValue: 'thin', label: 'Connection Mode',       description: 'thin = pure JS, no native libs. thick = requires Oracle Instant Client on the server.', configType: 'TEXT',     category: 'DB_CONNECTION' },
  { key: 'db.pool.min', defaultValue: '2',    label: 'Pool Min Connections',  description: 'Minimum connections kept alive in the pool (default 2)',                               configType: 'TEXT',       category: 'DB_CONNECTION' },
  { key: 'db.pool.max', defaultValue: '20',   label: 'Pool Max Connections',  description: 'Maximum concurrent connections in the pool (default 20)',                              configType: 'TEXT',       category: 'DB_CONNECTION' },


  // ── PATIENT ──────────────────────────────────────────────────────────────
  { key: 'patient.table',           defaultValue: 'PAT_MASTER',    label: 'Patient Table',               description: 'Main patient demographics table',                        configType: 'TABLE',        category: 'PATIENT' },
  { key: 'patient.col.mrn',         defaultValue: 'UHID',          label: 'MRN / UHID Column',           description: 'Unique patient identifier / MRN used across all tables',  configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.salutation',  defaultValue: 'SALUTATION',    label: 'Salutation Column',           description: 'Mr / Mrs / Dr prefix',                                   configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.firstName',   defaultValue: 'FIRST_NAME',    label: 'First Name Column',           description: '',                                                       configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.middleName',  defaultValue: 'MIDDLE_NAME',   label: 'Middle Name Column',          description: 'Nullable — used in NVL()',                               configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.lastName',    defaultValue: 'LAST_NAME',     label: 'Last Name Column',            description: '',                                                       configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.gender',      defaultValue: 'GENDER',        label: 'Gender Column',               description: 'Expected values: M / F / O',                             configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.dob',         defaultValue: 'DOB',           label: 'Date of Birth Column',        description: 'Used for birthday campaign trigger',                      configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.bloodGroup',  defaultValue: 'BLOOD_GROUP',   label: 'Blood Group Column',          description: '',                                                       configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.mobile',      defaultValue: 'MOBILE_NO',     label: 'Mobile Number Column',        description: 'Used for WhatsApp notifications',                         configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.email',       defaultValue: 'EMAIL_ID',      label: 'Email Column',                description: '',                                                       configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.address',     defaultValue: 'ADDRESS_LINE1', label: 'Address Column',              description: '',                                                       configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.city',        defaultValue: 'CITY',          label: 'City Column',                 description: '',                                                       configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.state',       defaultValue: 'STATE',         label: 'State Column',                description: '',                                                       configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.pinCode',     defaultValue: 'PIN_CODE',      label: 'PIN / ZIP Code Column',       description: '',                                                       configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.aadhaar',     defaultValue: 'AADHAAR_NO',    label: 'Aadhaar Column',              description: 'Only last 4 digits are read',                            configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.regDate',     defaultValue: 'REG_DATE',      label: 'Registration Date Column',    description: '',                                                       configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.col.status',      defaultValue: 'STATUS',        label: 'Patient Status Column',       description: 'Column that holds active/inactive flag',                  configType: 'COLUMN',       category: 'PATIENT' },
  { key: 'patient.status.active',   defaultValue: 'A',             label: 'Active Status Value',         description: 'Value in status column meaning the patient is active',    configType: 'STATUS_VALUE', category: 'PATIENT' },

  // ── PATIENT LOOKUPS (leave blank if stored as plain text) ────────────────
  // Salutation / Prefix
  { key: 'patient.lookup.salutation.table', defaultValue: '', label: 'Salutation Lookup Table',        description: 'Leave blank if salutation is plain text. e.g. PREFIX_MASTER, SALUTATION_MASTER', configType: 'TABLE',  category: 'PATIENT' },
  { key: 'patient.lookup.salutation.fk',   defaultValue: '', label: 'Salutation Lookup FK Column',    description: 'PK column in the lookup table matching patient FK. e.g. PREFIX_ID',              configType: 'COLUMN', category: 'PATIENT' },
  { key: 'patient.lookup.salutation.value',defaultValue: '', label: 'Salutation Lookup Value Column', description: 'Display column in the lookup table. e.g. PREFIX_NAME',                          configType: 'COLUMN', category: 'PATIENT' },
  // Gender
  { key: 'patient.lookup.gender.table',    defaultValue: '', label: 'Gender Lookup Table',            description: 'Leave blank if gender is plain text (M/F/O). e.g. GENDER_MASTER',               configType: 'TABLE',  category: 'PATIENT' },
  { key: 'patient.lookup.gender.fk',      defaultValue: '', label: 'Gender Lookup FK Column',        description: 'PK column in the lookup table. e.g. GENDER_ID',                                 configType: 'COLUMN', category: 'PATIENT' },
  { key: 'patient.lookup.gender.value',   defaultValue: '', label: 'Gender Lookup Value Column',     description: 'Display column in the lookup table. e.g. GENDER_NAME',                          configType: 'COLUMN', category: 'PATIENT' },
  // Blood Group
  { key: 'patient.lookup.bloodGroup.table', defaultValue: '', label: 'Blood Group Lookup Table',     description: 'Leave blank if blood group is plain text. e.g. BLOOD_GROUP_MASTER',              configType: 'TABLE',  category: 'PATIENT' },
  { key: 'patient.lookup.bloodGroup.fk',   defaultValue: '', label: 'Blood Group Lookup FK Column',  description: 'PK column in the lookup table. e.g. BLOOD_GROUP_ID',                            configType: 'COLUMN', category: 'PATIENT' },
  { key: 'patient.lookup.bloodGroup.value',defaultValue: '', label: 'Blood Group Lookup Value Column',description: 'Display column in the lookup table. e.g. BLOOD_GROUP_NAME',                    configType: 'COLUMN', category: 'PATIENT' },

  // ── BILLING ───────────────────────────────────────────────────────────────
  { key: 'billing.table',              defaultValue: 'BILL_MASTER',  label: 'Billing Header Table',          description: 'One row per bill/invoice',                                                      configType: 'TABLE',        category: 'BILLING' },
  { key: 'billing.col.billId',         defaultValue: 'BILL_NO',      label: 'Bill ID Column',                description: '⚡ Critical — stored as loyalty transaction reference. Must be unique per bill.', configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.mrn',            defaultValue: 'UHID',         label: 'Patient MRN Column (in bills)', description: 'Links bill to patient — must match patient.col.mrn',                             configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.patientName',    defaultValue: 'PATIENT_NAME', label: 'Patient Name Column',           description: 'Fallback name if PAT_MASTER is unavailable',                                    configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.visitId',        defaultValue: 'VISIT_ID',     label: 'Visit ID Column',               description: 'Linked visit number (nullable)',                                                 configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.billDate',       defaultValue: 'BILL_DATE',    label: 'Bill Date Column',              description: '',                                                                               configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.billType',       defaultValue: 'BILL_TYPE',    label: 'Bill Type Column',              description: 'OPD / IPD / PHARMACY etc.',                                                     configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.totalAmount',    defaultValue: 'TOTAL_AMT',    label: 'Total Amount Column',           description: '⚡ Critical — loyalty points calculated from this value (1 pt per ₹100)',        configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.paidAmount',     defaultValue: 'PAID_AMT',     label: 'Paid Amount Column',            description: '',                                                                               configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.balanceAmount',  defaultValue: 'BALANCE_AMT',  label: 'Balance Amount Column',         description: '',                                                                               configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.discountAmount', defaultValue: 'DISCOUNT_AMT', label: 'Discount Amount Column',        description: '',                                                                               configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.status',         defaultValue: 'BILL_STATUS',  label: 'Bill Status Column',            description: '⚡ Critical — used to filter only finalised bills',                              configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.doctorCode',     defaultValue: 'DOCTOR_CODE',  label: 'Doctor Code Column',            description: '',                                                                               configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.doctorName',     defaultValue: 'DOCTOR_NAME',  label: 'Doctor Name Column',            description: '',                                                                               configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.deptCode',       defaultValue: 'DEPT_CODE',    label: 'Department Code Column',        description: '',                                                                               configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.deptName',       defaultValue: 'DEPT_NAME',    label: 'Department Name Column',        description: '',                                                                               configType: 'COLUMN',       category: 'BILLING' },
  { key: 'billing.col.updatedAt',      defaultValue: 'UPDATED_AT',   label: 'Last Updated Column',           description: '⚡ Critical — sync cursor. Must be an indexed timestamp updated on every bill change. Common: LAST_UPDATED, MODIFIED_DATE, UPDATE_DATE', configType: 'COLUMN', category: 'BILLING' },
  { key: 'billing.status.finalised',   defaultValue: 'FINALISED',    label: 'Finalised Status Value',        description: '⚡ Critical — only bills with this status earn points. Common: F, FINAL, PAID, APPROVED', configType: 'STATUS_VALUE', category: 'BILLING' },
  { key: 'billing.status.cancelled',   defaultValue: 'CANCELLED',    label: 'Cancelled Status Value',        description: 'Bills with this status are excluded. Common: C, CANCEL, VOID, CAN',              configType: 'STATUS_VALUE', category: 'BILLING' },
  { key: 'billing.status.reversed',    defaultValue: 'REVERSED',     label: 'Reversed Status Value',         description: 'Bills with this status are excluded. Common: R, REV, REVERSE',                   configType: 'STATUS_VALUE', category: 'BILLING' },

  // ── BILLING LOOKUPS (leave blank if names are denormalized into bill header) ──
  // Department name from bill dept code
  { key: 'billing.lookup.dept.table', defaultValue: '', label: 'Dept Name Lookup Table',   description: 'Leave blank if DEPT_NAME is already in billing table. e.g. DEPARTMENT_MASTER', configType: 'TABLE',  category: 'BILLING' },
  { key: 'billing.lookup.dept.fk',   defaultValue: '', label: 'Dept Name Lookup FK',      description: 'PK column in dept lookup table. e.g. DEPT_CODE',                              configType: 'COLUMN', category: 'BILLING' },
  { key: 'billing.lookup.dept.value',defaultValue: '', label: 'Dept Name Lookup Value',   description: 'Display column in dept lookup table. e.g. DEPT_NAME',                         configType: 'COLUMN', category: 'BILLING' },
  // Doctor name from bill doctor code
  { key: 'billing.lookup.doctor.table', defaultValue: '', label: 'Doctor Name Lookup Table', description: 'Leave blank if DOCTOR_NAME is already in billing table. e.g. DOCTOR_MASTER', configType: 'TABLE',  category: 'BILLING' },
  { key: 'billing.lookup.doctor.fk',   defaultValue: '', label: 'Doctor Name Lookup FK',    description: 'PK column in doctor lookup table. e.g. DOCTOR_CODE',                         configType: 'COLUMN', category: 'BILLING' },
  { key: 'billing.lookup.doctor.value',defaultValue: '', label: 'Doctor Name Lookup Value', description: 'Display column in doctor lookup table. e.g. DOCTOR_NAME',                    configType: 'COLUMN', category: 'BILLING' },

  // ── BILL ITEMS ────────────────────────────────────────────────────────────
  { key: 'billItems.table',         defaultValue: 'BILL_ITEMS',  label: 'Bill Line Items Table',   description: 'One row per service/procedure in a bill',        configType: 'TABLE',  category: 'BILL_ITEMS' },
  { key: 'billItems.col.billId',    defaultValue: 'BILL_NO',     label: 'Bill ID Column',          description: 'FK linking items to bill header',                configType: 'COLUMN', category: 'BILL_ITEMS' },
  { key: 'billItems.col.itemCode',  defaultValue: 'ITEM_CODE',   label: 'Item / Service Code',     description: '',                                               configType: 'COLUMN', category: 'BILL_ITEMS' },
  { key: 'billItems.col.itemName',  defaultValue: 'ITEM_NAME',   label: 'Item / Service Name',     description: '',                                               configType: 'COLUMN', category: 'BILL_ITEMS' },
  { key: 'billItems.col.quantity',  defaultValue: 'QUANTITY',    label: 'Quantity Column',         description: '',                                               configType: 'COLUMN', category: 'BILL_ITEMS' },
  { key: 'billItems.col.unitPrice', defaultValue: 'UNIT_PRICE',  label: 'Unit Price Column',       description: '',                                               configType: 'COLUMN', category: 'BILL_ITEMS' },
  { key: 'billItems.col.amount',    defaultValue: 'AMOUNT',      label: 'Line Amount Column',      description: '',                                               configType: 'COLUMN', category: 'BILL_ITEMS' },
  { key: 'billItems.col.deptCode',  defaultValue: 'DEPT_CODE',   label: 'Department Code Column',  description: '',                                               configType: 'COLUMN', category: 'BILL_ITEMS' },
  { key: 'billItems.col.deptName',  defaultValue: 'DEPT_NAME',   label: 'Department Name Column',  description: '',                                               configType: 'COLUMN', category: 'BILL_ITEMS' },
  { key: 'billItems.col.serialNo',  defaultValue: 'SL_NO',       label: 'Serial / Sequence No.',   description: 'Used for ORDER BY on line items',                configType: 'COLUMN', category: 'BILL_ITEMS' },

  // ── VISIT ─────────────────────────────────────────────────────────────────
  { key: 'visit.table',              defaultValue: 'VISIT_MASTER',    label: 'Visit Table',               description: 'OPD / IPD visit records',            configType: 'TABLE',  category: 'VISIT' },
  { key: 'visit.col.visitId',        defaultValue: 'VISIT_ID',        label: 'Visit ID Column',           description: 'Unique visit identifier',             configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.mrn',            defaultValue: 'UHID',            label: 'Patient MRN Column',        description: 'Links visit to patient',              configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.visitDate',      defaultValue: 'VISIT_DATE',      label: 'Visit Date Column',         description: '',                                    configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.visitType',      defaultValue: 'VISIT_TYPE',      label: 'Visit Type Column',         description: 'OPD / IPD / EMERGENCY',              configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.admissionDate',  defaultValue: 'ADMISSION_DATE',  label: 'Admission Date Column',     description: 'IPD only — nullable',                 configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.dischargeDate',  defaultValue: 'DISCHARGE_DATE',  label: 'Discharge Date Column',     description: 'IPD only — nullable',                 configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.doctorCode',     defaultValue: 'DOCTOR_CODE',     label: 'Doctor Code Column',        description: '',                                    configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.doctorName',     defaultValue: 'DOCTOR_NAME',     label: 'Doctor Name Column',        description: '',                                    configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.deptCode',       defaultValue: 'DEPT_CODE',       label: 'Department Code Column',    description: '',                                    configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.deptName',       defaultValue: 'DEPT_NAME',       label: 'Department Name Column',    description: '',                                    configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.ward',           defaultValue: 'WARD_NAME',       label: 'Ward Name Column',          description: 'IPD only — nullable',                 configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.bed',            defaultValue: 'BED_NO',          label: 'Bed Number Column',         description: 'IPD only — nullable',                 configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.diagnosis',      defaultValue: 'DIAGNOSIS',       label: 'Diagnosis Column',          description: 'nullable',                            configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.col.status',         defaultValue: 'VISIT_STATUS',    label: 'Visit Status Column',       description: '',                                    configType: 'COLUMN', category: 'VISIT' },

  // ── VISIT LOOKUPS (leave blank if values are denormalized) ───────────────
  // Visit type
  { key: 'visit.lookup.visitType.table', defaultValue: '', label: 'Visit Type Lookup Table', description: 'Leave blank if visit type is plain text. e.g. VISIT_TYPE_MASTER', configType: 'TABLE',  category: 'VISIT' },
  { key: 'visit.lookup.visitType.fk',   defaultValue: '', label: 'Visit Type Lookup FK',    description: 'PK column in visit type lookup. e.g. VISIT_TYPE_ID',             configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.lookup.visitType.value',defaultValue: '', label: 'Visit Type Lookup Value', description: 'Display column in visit type lookup. e.g. VISIT_TYPE_NAME',       configType: 'COLUMN', category: 'VISIT' },
  // Ward
  { key: 'visit.lookup.ward.table', defaultValue: '', label: 'Ward Lookup Table', description: 'Leave blank if ward name is stored directly. e.g. WARD_MASTER',   configType: 'TABLE',  category: 'VISIT' },
  { key: 'visit.lookup.ward.fk',   defaultValue: '', label: 'Ward Lookup FK',    description: 'PK column in ward lookup table. e.g. WARD_ID',                    configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.lookup.ward.value',defaultValue: '', label: 'Ward Lookup Value', description: 'Display column in ward lookup table. e.g. WARD_NAME',             configType: 'COLUMN', category: 'VISIT' },
  // Department (visit)
  { key: 'visit.lookup.dept.table', defaultValue: '', label: 'Dept Name Lookup Table (Visit)', description: 'Leave blank if dept name is in visit table. e.g. DEPARTMENT_MASTER', configType: 'TABLE',  category: 'VISIT' },
  { key: 'visit.lookup.dept.fk',   defaultValue: '', label: 'Dept Name Lookup FK (Visit)',    description: 'PK column in dept lookup. e.g. DEPT_CODE',                            configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.lookup.dept.value',defaultValue: '', label: 'Dept Name Lookup Value (Visit)', description: 'Display column in dept lookup. e.g. DEPT_NAME',                       configType: 'COLUMN', category: 'VISIT' },
  // Doctor (visit)
  { key: 'visit.lookup.doctor.table', defaultValue: '', label: 'Doctor Name Lookup Table (Visit)', description: 'Leave blank if doctor name is in visit table. e.g. DOCTOR_MASTER', configType: 'TABLE',  category: 'VISIT' },
  { key: 'visit.lookup.doctor.fk',   defaultValue: '', label: 'Doctor Name Lookup FK (Visit)',    description: 'PK column in doctor lookup. e.g. DOCTOR_CODE',                      configType: 'COLUMN', category: 'VISIT' },
  { key: 'visit.lookup.doctor.value',defaultValue: '', label: 'Doctor Name Lookup Value (Visit)', description: 'Display column in doctor lookup. e.g. DOCTOR_NAME',                 configType: 'COLUMN', category: 'VISIT' },

  // ── DEPARTMENT ────────────────────────────────────────────────────────────
  { key: 'department.table',          defaultValue: 'DEPARTMENT_MASTER', label: 'Department Table',         description: 'Master list of hospital departments',          configType: 'TABLE',        category: 'DEPARTMENT' },
  { key: 'department.col.code',       defaultValue: 'DEPT_CODE',         label: 'Department Code Column',   description: '',                                             configType: 'COLUMN',       category: 'DEPARTMENT' },
  { key: 'department.col.name',       defaultValue: 'DEPT_NAME',         label: 'Department Name Column',   description: '',                                             configType: 'COLUMN',       category: 'DEPARTMENT' },
  { key: 'department.col.shortCode',  defaultValue: 'SHORT_CODE',        label: 'Short Code Column',        description: 'Abbreviated department code',                  configType: 'COLUMN',       category: 'DEPARTMENT' },
  { key: 'department.col.type',       defaultValue: 'DEPT_TYPE',         label: 'Department Type Column',   description: 'OPD / IPD / LAB etc.',                         configType: 'COLUMN',       category: 'DEPARTMENT' },
  { key: 'department.col.status',     defaultValue: 'STATUS',            label: 'Status Column',            description: 'Column holding active/inactive flag',          configType: 'COLUMN',       category: 'DEPARTMENT' },
  { key: 'department.status.active',  defaultValue: 'A',                 label: 'Active Status Value',      description: 'Value meaning department is active',           configType: 'STATUS_VALUE', category: 'DEPARTMENT' },

  // ── DEPARTMENT LOOKUPS ────────────────────────────────────────────────────
  { key: 'department.lookup.type.table', defaultValue: '', label: 'Dept Type Lookup Table', description: 'Leave blank if dept type is plain text. e.g. DEPT_TYPE_MASTER', configType: 'TABLE',  category: 'DEPARTMENT' },
  { key: 'department.lookup.type.fk',   defaultValue: '', label: 'Dept Type Lookup FK',    description: 'PK column in dept type lookup. e.g. DEPT_TYPE_ID',             configType: 'COLUMN', category: 'DEPARTMENT' },
  { key: 'department.lookup.type.value',defaultValue: '', label: 'Dept Type Lookup Value', description: 'Display column in dept type lookup. e.g. DEPT_TYPE_NAME',       configType: 'COLUMN', category: 'DEPARTMENT' },

  // ── DOCTOR ────────────────────────────────────────────────────────────────
  { key: 'doctor.table',             defaultValue: 'DOCTOR_MASTER',  label: 'Doctor Table',             description: 'Master list of doctors / consultants',   configType: 'TABLE',        category: 'DOCTOR' },
  { key: 'doctor.col.code',          defaultValue: 'DOCTOR_CODE',    label: 'Doctor Code Column',       description: '',                                       configType: 'COLUMN',       category: 'DOCTOR' },
  { key: 'doctor.col.name',          defaultValue: 'DOCTOR_NAME',    label: 'Doctor Name Column',       description: '',                                       configType: 'COLUMN',       category: 'DOCTOR' },
  { key: 'doctor.col.specialization',defaultValue: 'SPECIALIZATION', label: 'Specialization Column',    description: '',                                       configType: 'COLUMN',       category: 'DOCTOR' },
  { key: 'doctor.col.deptCode',      defaultValue: 'DEPT_CODE',      label: 'Department Code Column',   description: '',                                       configType: 'COLUMN',       category: 'DOCTOR' },
  { key: 'doctor.col.deptName',      defaultValue: 'DEPT_NAME',      label: 'Department Name Column',   description: '',                                       configType: 'COLUMN',       category: 'DOCTOR' },
  { key: 'doctor.col.qualification', defaultValue: 'QUALIFICATION',  label: 'Qualification Column',     description: 'nullable',                               configType: 'COLUMN',       category: 'DOCTOR' },
  { key: 'doctor.col.status',        defaultValue: 'STATUS',         label: 'Status Column',            description: 'Column holding active/inactive flag',    configType: 'COLUMN',       category: 'DOCTOR' },
  { key: 'doctor.status.active',     defaultValue: 'A',              label: 'Active Status Value',      description: 'Value meaning doctor is active',         configType: 'STATUS_VALUE', category: 'DOCTOR' },

  // ── DOCTOR LOOKUPS ────────────────────────────────────────────────────────
  { key: 'doctor.lookup.specialization.table', defaultValue: '', label: 'Specialization Lookup Table', description: 'Leave blank if specialization is plain text. e.g. SPECIALIZATION_MASTER', configType: 'TABLE',  category: 'DOCTOR' },
  { key: 'doctor.lookup.specialization.fk',   defaultValue: '', label: 'Specialization Lookup FK',    description: 'PK column in the lookup table. e.g. SPEC_ID',                           configType: 'COLUMN', category: 'DOCTOR' },
  { key: 'doctor.lookup.specialization.value',defaultValue: '', label: 'Specialization Lookup Value', description: 'Display column in the lookup table. e.g. SPEC_NAME',                    configType: 'COLUMN', category: 'DOCTOR' },
  { key: 'doctor.lookup.dept.table', defaultValue: '', label: 'Doctor Dept Lookup Table', description: 'Leave blank if dept name is in doctor table. e.g. DEPARTMENT_MASTER', configType: 'TABLE',  category: 'DOCTOR' },
  { key: 'doctor.lookup.dept.fk',   defaultValue: '', label: 'Doctor Dept Lookup FK',    description: 'PK column in dept lookup table. e.g. DEPT_CODE',                    configType: 'COLUMN', category: 'DOCTOR' },
  { key: 'doctor.lookup.dept.value',defaultValue: '', label: 'Doctor Dept Lookup Value', description: 'Display column in dept lookup table. e.g. DEPT_NAME',               configType: 'COLUMN', category: 'DOCTOR' },

  // ── RAW SQL QUERIES ───────────────────────────────────────────────────────
  // Admin writes full Oracle SQL; ZoeConnect executes it directly via oracledb named
  // binds. If empty, ZoeConnect falls back to dynamic SQL built from the column-config
  // keys above (fully backward-compatible).
  { key: 'sql.patient.getByMrn',      defaultValue: '', label: 'Patient - Lookup by MRN',    description: 'Must return all required aliases. Bind: :mrn',             configType: 'SQL_QUERY', category: 'SQL_QUERIES' },
  { key: 'sql.patient.search',        defaultValue: '', label: 'Patient - Search',            description: 'Full-text search. Binds: :term :like :lim',               configType: 'SQL_QUERY', category: 'SQL_QUERIES' },
  { key: 'sql.billing.getBillsByMrn', defaultValue: '', label: 'Billing - Bills by MRN',      description: 'Paginated bill headers. Binds: :mrn :lim',                 configType: 'SQL_QUERY', category: 'SQL_QUERIES' },
  { key: 'sql.billing.sync',          defaultValue: '', label: 'Billing - Real-time Sync',    description: 'Polled every 10 s. Binds: :since :lim',                   configType: 'SQL_QUERY', category: 'SQL_QUERIES' },
  { key: 'sql.billing.getLineItems',  defaultValue: '', label: 'Billing - Line Items',         description: 'Line items for one bill. Bind: :billId',                  configType: 'SQL_QUERY', category: 'SQL_QUERIES' },
  { key: 'sql.visit.getByMrn',        defaultValue: '', label: 'Visit - Visits by MRN',       description: 'Paginated visit records. Binds: :mrn :lim',               configType: 'SQL_QUERY', category: 'SQL_QUERIES' },
  { key: 'sql.reference.departments', defaultValue: '', label: 'Reference - Departments',      description: 'All active departments. Cached 1 h. No binds required.',  configType: 'SQL_QUERY', category: 'SQL_QUERIES' },
  { key: 'sql.reference.doctors',     defaultValue: '', label: 'Reference - Doctors',          description: 'All active doctors, optional dept filter. Cached 1 h.',   configType: 'SQL_QUERY', category: 'SQL_QUERIES' },
  // ── ATTENDANCE ─────────────────────────────────────────────────────────────

  // Core realtime polling
  { key: 'attendance.runtime.enabled',         defaultValue: 'false',        label: 'Realtime Polling Enabled',       description: 'Master switch for Oracle ATTLOGS realtime polling. Set true to activate. Changes take effect without restart. Env: ATTENDANCE_REALTIME_ENABLED',          configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.runtime.initialCursor',   defaultValue: '',             label: 'Initial Cursor (ISO-8601)',       description: 'Bootstrap cursor for first run — ISO-8601 datetime. Leave blank to default to midnight UTC today. Env: ATTENDANCE_INITIAL_CURSOR',                   configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.runtime.pollIntervalMs',  defaultValue: '1500',         label: 'Poll Interval (ms)',              description: 'How often the listener dequeues from Bull (milliseconds). Default 1500. Env: ATTENDANCE_POLL_INTERVAL_MS',                                            configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.runtime.pollBatchSize',   defaultValue: '500',          label: 'Poll Batch Size',                 description: 'Max punches fetched per polling cycle. Default 500. Env: ATTENDANCE_POLL_BATCH_SIZE',                                                               configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.runtime.debug',           defaultValue: 'false',        label: 'Debug Logging',                   description: 'Enable verbose structured attendance logs. Default false. Env: ATTENDANCE_DEBUG',                                                                    configType: 'TEXT', category: 'ATTENDANCE' },

  // Night / queue reconciliation
  { key: 'attendance.runtime.reconCron',       defaultValue: '0 30 1 * * *', label: 'Night Recon Cron',                description: 'Cron for nightly queue reconciliation (requires restart to change). Default: 1:30 AM. Env: ATTENDANCE_RECON_CRON',                                  configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.runtime.reconBatchSize',  defaultValue: '5000',         label: 'Night Recon Batch Size',          description: 'Max events per night reconciliation run. Default 5000. Env: ATTENDANCE_RECON_BATCH_SIZE',                                                           configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.runtime.reconStrategy',   defaultValue: 'ACCEPT_HIS',   label: 'HIS Divergence Strategy',         description: 'How to resolve ZoeConnect vs HIS divergences: ACCEPT_HIS | ACCEPT_HDSP | ALERT_ONLY. Default ACCEPT_HIS. Env: ATTENDANCE_RECON_STRATEGY',                configType: 'TEXT', category: 'ATTENDANCE' },

  // Dependency pollers — master
  { key: 'attendance.dependency.pollingEnabled',     defaultValue: 'true',   label: 'Dependency Polling Enabled',      description: 'Master switch for all dependency pollers (DutyPlan, Leave, Holiday, ShiftType). Default true. Env: DEPENDENCY_POLLING_ENABLED',                    configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.dependency.pollIntervalMs',     defaultValue: '60000',  label: 'Dependency Poll Interval (ms)',   description: 'How often the orchestrator ticks all dependency pollers (ms). Default 60000 (1 min). Env: DEPENDENCY_POLL_INTERVAL_MS',                              configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.dependency.pollBatchSize',      defaultValue: '500',    label: 'Dependency Poll Batch Size',      description: 'Max rows fetched per dependency poller tick. Shared by all four pollers. Default 500. Env: DEPENDENCY_POLL_BATCH_SIZE',                             configType: 'TEXT', category: 'ATTENDANCE' },

  // Dependency pollers — individual flags
  { key: 'attendance.dependency.dutyplanEnabled',    defaultValue: 'true',   label: 'DutyPlan Poller Enabled',         description: 'Enable DutyPlan (roster) change detection. Default true. Env: DEPENDENCY_DUTYPLAN_POLL_ENABLED',                                                    configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.dependency.leaveEnabled',       defaultValue: 'true',   label: 'Leave Poller Enabled',            description: 'Enable Leave change detection. Default true. Env: DEPENDENCY_LEAVE_POLL_ENABLED',                                                                    configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.dependency.holidayEnabled',     defaultValue: 'false',  label: 'Holiday Poller Enabled',          description: 'Enable Holiday change detection. Opt-in — set true to activate. Env: DEPENDENCY_HOLIDAY_POLL_ENABLED',                                               configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.dependency.shiftTypeEnabled',   defaultValue: 'false',  label: 'ShiftType Poller Enabled',        description: 'Enable ShiftType change detection. Opt-in — set true to activate. Env: DEPENDENCY_SHIFTTYPE_POLL_ENABLED',                                          configType: 'TEXT', category: 'ATTENDANCE' },

  // Dependency router & recalculation
  { key: 'attendance.dependency.routerEnabled',      defaultValue: 'true',   label: 'Dependency Router Enabled',       description: 'Route dependency events to re-enqueue affected attendance. Default true. Env: DEPENDENCY_ROUTER_ENABLED',                                             configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.dependency.dutyplanDebounceMs', defaultValue: '5000',   label: 'DutyPlan Debounce (ms)',          description: 'Debounce window before routing DutyPlan events (ms). Default 5000. Env: DEPENDENCY_DUTYPLAN_DEBOUNCE_MS',                                           configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.dependency.globalRecalcLimit',  defaultValue: '5000',   label: 'Global Recalc Limit',             description: 'Max employee-days enqueued per ALL-scope recalc (holiday). Default 5000. Env: DEPENDENCY_GLOBAL_RECALC_LIMIT',                                      configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.dependency.configLookbackDays', defaultValue: '7',      label: 'Config Lookback Days',            description: 'Lookback window in days when shift config changes. Default 7. Env: DEPENDENCY_CONFIG_LOOKBACK_DAYS',                                                 configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.dependency.configRecalcLimit',  defaultValue: '10000',  label: 'Config Recalc Limit',             description: 'Max employee-days per config-scope recalc. Default 10000. Env: DEPENDENCY_CONFIG_RECALC_LIMIT',                                                     configType: 'TEXT', category: 'ATTENDANCE' },

  // HIS reconciliation
  { key: 'attendance.recon.enabled',           defaultValue: 'true',         label: 'HIS Recon Enabled',               description: 'Enable nightly HIS reconciliation job. Default true. Env: HIS_RECON_ENABLED',                                                                        configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.recon.cron',              defaultValue: '0 30 3 * * *', label: 'HIS Recon Cron',                  description: 'Cron for nightly HIS reconciliation (requires restart). Default: 3:30 AM. Env: HIS_RECON_CRON',                                                    configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.recon.lookbackDays',      defaultValue: '1',            label: 'HIS Recon Lookback Days',         description: 'How many days back HIS recon compares. Default 1 (yesterday). Env: HIS_RECON_LOOKBACK_DAYS',                                                        configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.recon.batchSize',         defaultValue: '10000',        label: 'HIS Recon Batch Size',            description: 'Max Oracle rows per HIS recon run. Default 10000. Env: HIS_RECON_BATCH_SIZE',                                                                       configType: 'TEXT', category: 'ATTENDANCE' },

  // Retroactive recalculation
  { key: 'attendance.retroactive.deptEmpLimit',  defaultValue: '5000',       label: 'Retro Dept Employee Limit',       description: 'Max employees fetched for department-scope retroactive recalc. Default 5000. Env: RETROACTIVE_DEPT_EMP_LIMIT',                                       configType: 'TEXT', category: 'ATTENDANCE' },
  { key: 'attendance.retroactive.batchLimit',    defaultValue: '20000',       label: 'Retro Batch Limit',               description: 'Overall cap on employee-days per retroactive recalc run. Default 20000. Env: RETROACTIVE_RECALC_BATCH_LIMIT',                                       configType: 'TEXT', category: 'ATTENDANCE' },

];

export const CATEGORY_LABELS: Record<string, string> = {
  DB_CONNECTION: 'Database Connection',
  PATIENT:       'Patient Master',
  BILLING:       'Billing Header',
  BILL_ITEMS:    'Bill Line Items',
  VISIT:         'Visit / Admission',
  DEPARTMENT:    'Department Master',
  DOCTOR:        'Doctor Master',
  SQL_QUERIES:   'Raw SQL Queries',
  ATTENDANCE:    'Attendance Runtime Config',
};
